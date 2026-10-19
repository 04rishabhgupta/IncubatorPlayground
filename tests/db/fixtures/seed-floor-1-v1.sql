-- =============================================================================
-- Local development seed (applied by `supabase db reset`).
-- Reference data only: one building, its first floor, the floor drawing and
-- its interactive spaces, plus the industry list. Companies are created
-- through the registration flow; none are seeded here.
-- Coordinates use the layout's own unit space (width x height), not pixels.
-- =============================================================================

insert into public.buildings (id, name, slug, address, timezone)
values ('00000000-0000-4000-8000-000000000001',
        'Incubation Centre', 'incubation-centre', null, 'Asia/Kolkata')
on conflict (id) do nothing;

insert into public.floors (id, building_id, name, slug, level)
values ('00000000-0000-4000-8000-000000000101',
        '00000000-0000-4000-8000-000000000001', 'Floor 1', 'floor-1', 1)
on conflict (id) do nothing;

insert into public.floor_layouts (floor_id, width, height, geometry)
values (
  '00000000-0000-4000-8000-000000000101',
  1200, 800,
  $json${
    "walls": [
      { "points": [[20, 20], [1180, 20], [1180, 780], [20, 780]], "closed": true }
    ],
    "areas": [
      { "key": "corridor", "kind": "corridor", "label": "Corridor",
        "shape": { "type": "rect", "x": 40, "y": 340, "width": 1120, "height": 120 } },
      { "key": "lounge", "kind": "lounge", "label": "Lounge",
        "shape": { "type": "rect", "x": 680, "y": 480, "width": 240, "height": 130 } },
      { "key": "pantry", "kind": "pantry", "label": "Pantry",
        "shape": { "type": "rect", "x": 680, "y": 630, "width": 240, "height": 130 } }
    ],
    "entrances": [
      { "key": "main", "label": "Main Entrance", "x": 1010, "y": 780, "width": 80, "orientation": "horizontal" }
    ]
  }$json$::jsonb
)
on conflict (floor_id) do nothing;

insert into public.floor_spaces (floor_id, code, kind, label, shape, capacity, sort_order)
values
  ('00000000-0000-4000-8000-000000000101', '101', 'office', 'Office 101',
   '{"type": "rect", "x": 40, "y": 40, "width": 360, "height": 280}', 12, 1),
  ('00000000-0000-4000-8000-000000000101', '102', 'office', 'Office 102',
   '{"type": "rect", "x": 420, "y": 40, "width": 360, "height": 280}', 12, 2),
  ('00000000-0000-4000-8000-000000000101', '103', 'office', 'Office 103',
   '{"type": "rect", "x": 800, "y": 40, "width": 360, "height": 280}', 12, 3),
  ('00000000-0000-4000-8000-000000000101', '104', 'office', 'Office 104',
   '{"type": "rect", "x": 40, "y": 480, "width": 360, "height": 280}', 12, 4),
  ('00000000-0000-4000-8000-000000000101', 'BR-1', 'meeting_room', 'Boardroom',
   '{"type": "rect", "x": 420, "y": 480, "width": 240, "height": 280}', 10, 5),
  ('00000000-0000-4000-8000-000000000101', 'REC', 'reception', 'Reception',
   '{"type": "rect", "x": 940, "y": 480, "width": 220, "height": 280}', null, 6)
on conflict (floor_id, code) do nothing;

insert into public.industries (name, slug)
values
  ('Artificial Intelligence', 'artificial-intelligence'),
  ('Biotechnology', 'biotechnology'),
  ('Clean Energy', 'clean-energy'),
  ('Deep Tech & Hardware', 'deep-tech-hardware'),
  ('E-commerce', 'e-commerce'),
  ('Education', 'education'),
  ('Fintech', 'fintech'),
  ('Healthcare', 'healthcare'),
  ('Logistics', 'logistics'),
  ('SaaS', 'saas'),
  ('Other', 'other')
on conflict (slug) do nothing;
