-- Add sample elections with 3 parties
INSERT INTO public.elections (title, description, options, start_date, end_date, is_active) VALUES 
(
  'General Election 2024', 
  'Vote for your preferred political party in the upcoming general election.',
  '[
    {"id": "party1", "name": "Democratic Party", "description": "Progressive policies for economic equality and social justice", "color": "#0066CC"},
    {"id": "party2", "name": "Republican Party", "description": "Conservative values with focus on free market and traditional principles", "color": "#CC0000"},
    {"id": "party3", "name": "Independent Alliance", "description": "Centrist approach focusing on practical solutions and bipartisan cooperation", "color": "#009900"}
  ]'::jsonb,
  NOW() - INTERVAL '1 day',
  NOW() + INTERVAL '30 days',
  true
);