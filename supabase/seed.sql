-- =============================================================================
-- Local development seed (applied by `supabase db reset`).
-- Reference data only: one building, its first floor, the floor drawing and
-- its interactive spaces, plus the industry list. Companies are created
-- through the registration flow; none are seeded here.
-- The Floor 1 drawing is generated from src/lib/floor/layouts/floor-1.ts
-- (a unit test keeps the two in sync).
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
    {"points":[[28,28],[1172,28],[1172,772],[28,772]],"closed":true,"kind":"exterior","thickness":24},
    {"points":[[28,330],[1172,330]],"closed":false,"kind":"interior","thickness":8},
    {"points":[[412,28],[412,330]],"closed":false,"kind":"interior","thickness":8},
    {"points":[[788,28],[788,330]],"closed":false,"kind":"interior","thickness":8},
    {"points":[[28,470],[412,470]],"closed":false,"kind":"interior","thickness":8},
    {"points":[[412,470],[412,772]],"closed":false,"kind":"interior","thickness":8},
    {"points":[[670,470],[670,772]],"closed":false,"kind":"interior","thickness":8},
    {"points":[[930,470],[930,772]],"closed":false,"kind":"interior","thickness":8},
    {"points":[[930,470],[1172,470]],"closed":false,"kind":"interior","thickness":8},
    {"points":[[670,620],[930,620]],"closed":false,"kind":"interior","thickness":8},
    {"points":[[412,470],[670,470]],"closed":false,"kind":"glass","thickness":8}
  ],
  "areas": [
    {"key":"corridor","kind":"corridor","label":"Corridor","shape":{"type":"rect","x":40,"y":334,"width":1120,"height":132}},
    {"key":"lounge","kind":"lounge","label":"Lounge","shape":{"type":"rect","x":674,"y":474,"width":252,"height":142},"info":{"description":"Informal seating for quick chats.","amenities":["Sofa","Wi-Fi"]}},
    {"key":"pantry","kind":"pantry","label":"Pantry","shape":{"type":"rect","x":674,"y":624,"width":252,"height":136},"info":{"description":"Coffee, tea and a fridge.","amenities":["Coffee machine","Fridge"]}}
  ],
  "entrances": [
    {"key":"main","label":"Main Entrance","x":1010,"y":772,"width":80,"orientation":"horizontal"}
  ],
  "doors": [
    {"x":210,"y":330,"width":40,"orientation":"horizontal","swing":-1,"hinge":"start","kind":"single"},
    {"x":586,"y":330,"width":40,"orientation":"horizontal","swing":-1,"hinge":"start","kind":"single"},
    {"x":962,"y":330,"width":40,"orientation":"horizontal","swing":-1,"hinge":"start","kind":"single"},
    {"x":210,"y":470,"width":40,"orientation":"horizontal","swing":1,"hinge":"start","kind":"single"},
    {"x":500,"y":470,"width":72,"orientation":"horizontal","swing":1,"hinge":"start","kind":"double"},
    {"x":930,"y":500,"width":60,"orientation":"vertical","swing":-1,"hinge":"start","kind":"sliding"},
    {"x":990,"y":470,"width":120,"orientation":"horizontal","swing":1,"hinge":"start","kind":"opening"},
    {"x":730,"y":620,"width":140,"orientation":"horizontal","swing":1,"hinge":"start","kind":"opening"}
  ],
  "windows": [
    {"x":74,"y":28,"length":300,"orientation":"horizontal"},
    {"x":450,"y":28,"length":300,"orientation":"horizontal"},
    {"x":826,"y":28,"length":300,"orientation":"horizontal"},
    {"x":74,"y":772,"length":300,"orientation":"horizontal"},
    {"x":461,"y":772,"length":160,"orientation":"horizontal"},
    {"x":710,"y":772,"length":180,"orientation":"horizontal"},
    {"x":28,"y":80,"length":200,"orientation":"vertical"},
    {"x":28,"y":520,"length":200,"orientation":"vertical"},
    {"x":1172,"y":80,"length":200,"orientation":"vertical"},
    {"x":1172,"y":540,"length":180,"orientation":"vertical"}
  ],
  "fixtures": [
    {"kind":"chair","x":77,"y":56,"width":22,"height":22,"rotation":180,"seat":1},
    {"kind":"desk_pair","x":64,"y":80,"width":48,"height":56,"rotation":0},
    {"kind":"chair","x":77,"y":138,"width":22,"height":22,"rotation":0,"seat":7},
    {"kind":"chair","x":125,"y":56,"width":22,"height":22,"rotation":180,"seat":2},
    {"kind":"desk_pair","x":112,"y":80,"width":48,"height":56,"rotation":0},
    {"kind":"chair","x":125,"y":138,"width":22,"height":22,"rotation":0,"seat":8},
    {"kind":"chair","x":173,"y":56,"width":22,"height":22,"rotation":180,"seat":3},
    {"kind":"desk_pair","x":160,"y":80,"width":48,"height":56,"rotation":0},
    {"kind":"chair","x":173,"y":138,"width":22,"height":22,"rotation":0,"seat":9},
    {"kind":"chair","x":253,"y":56,"width":22,"height":22,"rotation":180,"seat":4},
    {"kind":"desk_pair","x":240,"y":80,"width":48,"height":56,"rotation":0},
    {"kind":"chair","x":253,"y":138,"width":22,"height":22,"rotation":0,"seat":10},
    {"kind":"chair","x":301,"y":56,"width":22,"height":22,"rotation":180,"seat":5},
    {"kind":"desk_pair","x":288,"y":80,"width":48,"height":56,"rotation":0},
    {"kind":"chair","x":301,"y":138,"width":22,"height":22,"rotation":0,"seat":11},
    {"kind":"chair","x":349,"y":56,"width":22,"height":22,"rotation":180,"seat":6},
    {"kind":"desk_pair","x":336,"y":80,"width":48,"height":56,"rotation":0},
    {"kind":"chair","x":349,"y":138,"width":22,"height":22,"rotation":0,"seat":12},
    {"kind":"round_table","x":64,"y":240,"width":64,"height":64,"rotation":0},
    {"kind":"bookshelf","x":290,"y":308,"width":96,"height":16,"rotation":0},
    {"kind":"plant","x":370,"y":200,"width":20,"height":20,"rotation":0},
    {"kind":"chair","x":453,"y":56,"width":22,"height":22,"rotation":180,"seat":1},
    {"kind":"desk_pair","x":440,"y":80,"width":48,"height":56,"rotation":0},
    {"kind":"chair","x":453,"y":138,"width":22,"height":22,"rotation":0,"seat":7},
    {"kind":"chair","x":501,"y":56,"width":22,"height":22,"rotation":180,"seat":2},
    {"kind":"desk_pair","x":488,"y":80,"width":48,"height":56,"rotation":0},
    {"kind":"chair","x":501,"y":138,"width":22,"height":22,"rotation":0,"seat":8},
    {"kind":"chair","x":549,"y":56,"width":22,"height":22,"rotation":180,"seat":3},
    {"kind":"desk_pair","x":536,"y":80,"width":48,"height":56,"rotation":0},
    {"kind":"chair","x":549,"y":138,"width":22,"height":22,"rotation":0,"seat":9},
    {"kind":"chair","x":629,"y":56,"width":22,"height":22,"rotation":180,"seat":4},
    {"kind":"desk_pair","x":616,"y":80,"width":48,"height":56,"rotation":0},
    {"kind":"chair","x":629,"y":138,"width":22,"height":22,"rotation":0,"seat":10},
    {"kind":"chair","x":677,"y":56,"width":22,"height":22,"rotation":180,"seat":5},
    {"kind":"desk_pair","x":664,"y":80,"width":48,"height":56,"rotation":0},
    {"kind":"chair","x":677,"y":138,"width":22,"height":22,"rotation":0,"seat":11},
    {"kind":"chair","x":725,"y":56,"width":22,"height":22,"rotation":180,"seat":6},
    {"kind":"desk_pair","x":712,"y":80,"width":48,"height":56,"rotation":0},
    {"kind":"chair","x":725,"y":138,"width":22,"height":22,"rotation":0,"seat":12},
    {"kind":"round_table","x":440,"y":240,"width":64,"height":64,"rotation":0},
    {"kind":"bookshelf","x":666,"y":308,"width":96,"height":16,"rotation":0},
    {"kind":"plant","x":746,"y":200,"width":20,"height":20,"rotation":0},
    {"kind":"chair","x":829,"y":56,"width":22,"height":22,"rotation":180,"seat":1},
    {"kind":"desk_pair","x":816,"y":80,"width":48,"height":56,"rotation":0},
    {"kind":"chair","x":829,"y":138,"width":22,"height":22,"rotation":0,"seat":7},
    {"kind":"chair","x":877,"y":56,"width":22,"height":22,"rotation":180,"seat":2},
    {"kind":"desk_pair","x":864,"y":80,"width":48,"height":56,"rotation":0},
    {"kind":"chair","x":877,"y":138,"width":22,"height":22,"rotation":0,"seat":8},
    {"kind":"chair","x":925,"y":56,"width":22,"height":22,"rotation":180,"seat":3},
    {"kind":"desk_pair","x":912,"y":80,"width":48,"height":56,"rotation":0},
    {"kind":"chair","x":925,"y":138,"width":22,"height":22,"rotation":0,"seat":9},
    {"kind":"chair","x":1005,"y":56,"width":22,"height":22,"rotation":180,"seat":4},
    {"kind":"desk_pair","x":992,"y":80,"width":48,"height":56,"rotation":0},
    {"kind":"chair","x":1005,"y":138,"width":22,"height":22,"rotation":0,"seat":10},
    {"kind":"chair","x":1053,"y":56,"width":22,"height":22,"rotation":180,"seat":5},
    {"kind":"desk_pair","x":1040,"y":80,"width":48,"height":56,"rotation":0},
    {"kind":"chair","x":1053,"y":138,"width":22,"height":22,"rotation":0,"seat":11},
    {"kind":"chair","x":1101,"y":56,"width":22,"height":22,"rotation":180,"seat":6},
    {"kind":"desk_pair","x":1088,"y":80,"width":48,"height":56,"rotation":0},
    {"kind":"chair","x":1101,"y":138,"width":22,"height":22,"rotation":0,"seat":12},
    {"kind":"round_table","x":816,"y":240,"width":64,"height":64,"rotation":0},
    {"kind":"bookshelf","x":1042,"y":308,"width":96,"height":16,"rotation":0},
    {"kind":"plant","x":1122,"y":200,"width":20,"height":20,"rotation":0},
    {"kind":"chair","x":77,"y":640,"width":22,"height":22,"rotation":180,"seat":7},
    {"kind":"desk_pair","x":64,"y":664,"width":48,"height":56,"rotation":0},
    {"kind":"chair","x":77,"y":722,"width":22,"height":22,"rotation":0,"seat":1},
    {"kind":"chair","x":125,"y":640,"width":22,"height":22,"rotation":180,"seat":8},
    {"kind":"desk_pair","x":112,"y":664,"width":48,"height":56,"rotation":0},
    {"kind":"chair","x":125,"y":722,"width":22,"height":22,"rotation":0,"seat":2},
    {"kind":"chair","x":173,"y":640,"width":22,"height":22,"rotation":180,"seat":9},
    {"kind":"desk_pair","x":160,"y":664,"width":48,"height":56,"rotation":0},
    {"kind":"chair","x":173,"y":722,"width":22,"height":22,"rotation":0,"seat":3},
    {"kind":"chair","x":253,"y":640,"width":22,"height":22,"rotation":180,"seat":10},
    {"kind":"desk_pair","x":240,"y":664,"width":48,"height":56,"rotation":0},
    {"kind":"chair","x":253,"y":722,"width":22,"height":22,"rotation":0,"seat":4},
    {"kind":"chair","x":301,"y":640,"width":22,"height":22,"rotation":180,"seat":11},
    {"kind":"desk_pair","x":288,"y":664,"width":48,"height":56,"rotation":0},
    {"kind":"chair","x":301,"y":722,"width":22,"height":22,"rotation":0,"seat":5},
    {"kind":"chair","x":349,"y":640,"width":22,"height":22,"rotation":180,"seat":12},
    {"kind":"desk_pair","x":336,"y":664,"width":48,"height":56,"rotation":0},
    {"kind":"chair","x":349,"y":722,"width":22,"height":22,"rotation":0,"seat":6},
    {"kind":"round_table","x":64,"y":496,"width":64,"height":64,"rotation":0},
    {"kind":"bookshelf","x":290,"y":476,"width":96,"height":16,"rotation":180},
    {"kind":"plant","x":370,"y":580,"width":20,"height":20,"rotation":0},
    {"kind":"meeting_table","x":496,"y":548,"width":90,"height":160,"rotation":90},
    {"kind":"tv_screen","x":509,"y":752,"width":64,"height":5,"rotation":0},
    {"kind":"whiteboard","x":418,"y":584,"width":6,"height":72,"rotation":0},
    {"kind":"plant","x":640,"y":736,"width":20,"height":20,"rotation":0},
    {"kind":"rug","x":715,"y":490,"width":170,"height":90,"rotation":0},
    {"kind":"sofa","x":745,"y":574,"width":110,"height":34,"rotation":180},
    {"kind":"armchair","x":690,"y":506,"width":32,"height":32,"rotation":270},
    {"kind":"armchair","x":878,"y":506,"width":32,"height":32,"rotation":90},
    {"kind":"coffee_table","x":770,"y":516,"width":60,"height":30,"rotation":0},
    {"kind":"plant","x":900,"y":588,"width":20,"height":20,"rotation":0},
    {"kind":"kitchen_counter","x":690,"y":734,"width":184,"height":24,"rotation":180},
    {"kind":"sink","x":716,"y":735,"width":32,"height":22,"rotation":180},
    {"kind":"coffee_machine","x":790,"y":738,"width":16,"height":16,"rotation":0},
    {"kind":"fridge","x":890,"y":730,"width":28,"height":28,"rotation":180},
    {"kind":"round_table","x":770,"y":650,"width":60,"height":60,"rotation":0},
    {"kind":"water_cooler","x":682,"y":632,"width":14,"height":14,"rotation":0},
    {"kind":"reception_desk","x":982,"y":602,"width":130,"height":44,"rotation":0},
    {"kind":"chair","x":1013,"y":578,"width":22,"height":22,"rotation":180},
    {"kind":"chair","x":1059,"y":578,"width":22,"height":22,"rotation":180},
    {"kind":"sofa","x":938,"y":660,"width":32,"height":84,"rotation":270},
    {"kind":"armchair","x":1124,"y":664,"width":32,"height":32,"rotation":90},
    {"kind":"armchair","x":1124,"y":702,"width":32,"height":32,"rotation":90},
    {"kind":"coffee_table","x":1092,"y":676,"width":24,"height":46,"rotation":0},
    {"kind":"plant","x":1136,"y":736,"width":20,"height":20,"rotation":0},
    {"kind":"plant","x":940,"y":480,"width":20,"height":20,"rotation":0},
    {"kind":"water_cooler","x":1140,"y":482,"width":14,"height":14,"rotation":0},
    {"kind":"plant","x":48,"y":342,"width":20,"height":20,"rotation":0},
    {"kind":"lockers","x":650,"y":338,"width":96,"height":18,"rotation":0},
    {"kind":"printer","x":1120,"y":340,"width":32,"height":24,"rotation":0}
  ]
}$json$::jsonb
)
on conflict (floor_id) do nothing;

insert into public.floor_spaces (floor_id, code, kind, label, shape, capacity, sort_order)
values
  ('00000000-0000-4000-8000-000000000101', '101', 'office', 'Office 101',
   '{"type": "rect", "x": 40, "y": 40, "width": 368, "height": 286}', 12, 1),
  ('00000000-0000-4000-8000-000000000101', '102', 'office', 'Office 102',
   '{"type": "rect", "x": 416, "y": 40, "width": 368, "height": 286}', 12, 2),
  ('00000000-0000-4000-8000-000000000101', '103', 'office', 'Office 103',
   '{"type": "rect", "x": 792, "y": 40, "width": 368, "height": 286}', 12, 3),
  ('00000000-0000-4000-8000-000000000101', '104', 'office', 'Office 104',
   '{"type": "rect", "x": 40, "y": 474, "width": 368, "height": 286}', 12, 4),
  ('00000000-0000-4000-8000-000000000101', 'BR-1', 'meeting_room', 'Boardroom',
   '{"type": "rect", "x": 416, "y": 474, "width": 250, "height": 286}', 10, 5),
  ('00000000-0000-4000-8000-000000000101', 'REC', 'reception', 'Reception',
   '{"type": "rect", "x": 934, "y": 474, "width": 226, "height": 286}', null, 6)
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
