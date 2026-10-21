-- =============================================================================
-- Phase 4R.4: Floor tagline, description and building metadata
--
-- Adds optional tagline and description columns to public.floors so each
-- floor can communicate its focus, amenities and theme on the public map.
-- =============================================================================

alter table public.floors
  add column if not exists tagline text,
  add column if not exists description text;

-- Add helpful metadata to Floor 1 if not already customized
update public.floors
   set tagline = coalesce(tagline, 'Deep tech, robotics & AI incubation'),
       description = coalesce(description, 'Home to early-stage deep tech ventures, shared prototyping zones, boardroom and collaboration lounges.')
 where slug = 'floor-1';
