import { InputField } from "@/components/ui/field";

/** New-password + confirmation pair with the policy hint. */
export function PasswordFields({
  errors,
  label = "Password",
}: {
  errors?: Record<string, string[] | undefined>;
  label?: string;
}) {
  return (
    <>
      <InputField
        name="password"
        type="password"
        label={label}
        autoComplete="new-password"
        hint="At least 8 characters, with upper- and lowercase letters and a number."
        errors={errors?.password}
      />
      <InputField
        name="confirmPassword"
        type="password"
        label="Confirm password"
        autoComplete="new-password"
        errors={errors?.confirmPassword}
      />
    </>
  );
}
