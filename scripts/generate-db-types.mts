/**
 * Offline generator for src/types/database.ts.
 *
 * Applies the migrations to an in-memory PGlite database (see
 * tests/db/harness.ts) and emits types in the same shape as
 * `supabase gen types typescript`, so the app's typed Supabase client works
 * without Docker or a linked project. Once a project is linked, the official
 * `npm run db:types` produces an equivalent file.
 *
 * Usage: npm run db:types:offline
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { createTestDatabase } from "../tests/db/harness.ts";

type Column = {
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: "YES" | "NO";
  column_default: string | null;
  is_generated: "ALWAYS" | "NEVER";
  is_identity: "YES" | "NO";
};

type Relationship = {
  table_name: string;
  constraint_name: string;
  columns: string[];
  referenced_table: string;
  referenced_columns: string[];
  is_one_to_one: boolean;
};

type Fn = { name: string; arg_names: string[] | null; arg_types: string[]; return_type: string };

const db = await createTestDatabase();

const enums = (
  await db.query<{ name: string; values: string[] }>(`
    select t.typname as name, array_agg(e.enumlabel order by e.enumsortorder) as values
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
    group by t.typname
    order by t.typname`)
).rows;
const enumNames = new Set(enums.map((e) => e.name));

const columns = (
  await db.query<Column>(`
    select c.table_name, c.column_name, c.data_type, c.udt_name, c.is_nullable,
           c.column_default, c.is_generated, c.is_identity
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
    order by c.table_name, c.ordinal_position`)
).rows;

const relationships = (
  await db.query<Relationship>(`
    select src.relname as table_name,
           con.conname as constraint_name,
           array(select a.attname from unnest(con.conkey) with ordinality k(attnum, ord)
                 join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
                 order by k.ord) as columns,
           dst.relname as referenced_table,
           array(select a.attname from unnest(con.confkey) with ordinality k(attnum, ord)
                 join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum
                 order by k.ord) as referenced_columns,
           exists (
             select 1 from pg_index i
             where i.indrelid = con.conrelid and i.indisunique and i.indpred is null
               and (select array_agg(x order by x) from unnest(i.indkey::int2[]) x)
                 = (select array_agg(x order by x) from unnest(con.conkey) x)
           ) as is_one_to_one
    from pg_constraint con
    join pg_class src on src.oid = con.conrelid
    join pg_class dst on dst.oid = con.confrelid
    join pg_namespace n on n.oid = src.relnamespace
    join pg_namespace dn on dn.oid = dst.relnamespace
    where con.contype = 'f' and n.nspname = 'public' and dn.nspname = 'public'
    order by src.relname, con.conname`)
).rows;

const functions = (
  await db.query<Fn>(`
    select p.proname as name,
           p.proargnames as arg_names,
           array(select format_type(t, null) from unnest(p.proargtypes) t) as arg_types,
           format_type(p.prorettype, null) as return_type
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype <> 'trigger'::regtype
      and p.prokind = 'f'
      and has_function_privilege('authenticated', p.oid, 'execute')
    order by p.proname`)
).rows;

await db.close();

function scalar(type: string): string {
  const t = type.replace(/^public\./, "");
  if (enumNames.has(t)) return `Database["public"]["Enums"]["${t}"]`;
  if (t.endsWith("[]")) return `${scalar(t.slice(0, -2))}[]`;
  if (/^(smallint|integer|bigint|numeric|real|double precision|int2|int4|int8|float4|float8)$/.test(t)) {
    return "number";
  }
  if (/^(boolean|bool)$/.test(t)) return "boolean";
  if (/^(json|jsonb)$/.test(t)) return "Json";
  return "string";
}

function columnType(c: Column): string {
  if (c.data_type === "ARRAY") return `${scalar(c.udt_name.replace(/^_/, ""))}[]`;
  if (c.data_type === "USER-DEFINED") return scalar(c.udt_name);
  return scalar(c.udt_name);
}

const q = (s: string) => JSON.stringify(s);
const tables = [...new Set(columns.map((c) => c.table_name))];

function tableBlock(table: string) {
  const cols = columns.filter((c) => c.table_name === table);
  const row = cols.map(
    (c) => `          ${c.column_name}: ${columnType(c)}${c.is_nullable === "YES" ? " | null" : ""}`,
  );
  const insert = cols
    .filter((c) => c.is_generated !== "ALWAYS")
    .map((c) => {
      const optional = c.is_nullable === "YES" || c.column_default !== null || c.is_identity === "YES";
      return `          ${c.column_name}${optional ? "?" : ""}: ${columnType(c)}${c.is_nullable === "YES" ? " | null" : ""}`;
    });
  const update = cols
    .filter((c) => c.is_generated !== "ALWAYS")
    .map((c) => `          ${c.column_name}?: ${columnType(c)}${c.is_nullable === "YES" ? " | null" : ""}`);
  const rels = relationships
    .filter((r) => r.table_name === table)
    .map(
      (r) => `          {
            foreignKeyName: ${q(r.constraint_name)}
            columns: [${r.columns.map(q).join(", ")}]
            isOneToOne: ${r.is_one_to_one}
            referencedRelation: ${q(r.referenced_table)}
            referencedColumns: [${r.referenced_columns.map(q).join(", ")}]
          },`,
    );
  return `      ${table}: {
        Row: {
${row.join("\n")}
        }
        Insert: {
${insert.join("\n")}
        }
        Update: {
${update.join("\n")}
        }
        Relationships: [
${rels.join("\n")}
        ]
      }`;
}

function functionBlock(fn: Fn) {
  const args = fn.arg_types.map((t, i) => `          ${fn.arg_names?.[i] ?? `arg${i}`}: ${scalar(t)}`);
  return `      ${fn.name}: {
        Args: ${args.length ? `{\n${args.join("\n")}\n        }` : "never"}
        Returns: ${scalar(fn.return_type)}
      }`;
}

const output = `// Generated by scripts/generate-db-types.ts from supabase/migrations.
// Do not edit by hand: run \`npm run db:types:offline\` (or \`npm run db:types\`
// against a linked Supabase project) after changing the schema.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "13"
  }
  public: {
    Tables: {
${tables.map(tableBlock).join("\n")}
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
${functions.map(functionBlock).join("\n")}
    }
    Enums: {
${enums.map((e) => `      ${e.name}: ${e.values.map(q).join(" | ")}`).join("\n")}
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database["public"]

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"]
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T]
`;

const target = path.resolve(import.meta.dirname, "../src/types/database.ts");
writeFileSync(target, output);
console.log(
  `Wrote ${path.relative(process.cwd(), target)} (${tables.length} tables, ${enums.length} enums, ${functions.length} functions)`,
);
