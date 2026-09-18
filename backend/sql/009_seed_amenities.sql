insert into amenities (name, category, icon) values
  ('Parking', 'Exterior', 'car'),
  ('Garage', 'Exterior', 'warehouse'),
  ('Garden', 'Exterior', 'tree'),
  ('Pool', 'Recreation', 'waves'),
  ('Gym', 'Recreation', 'dumbbell'),
  ('Security', 'Safety', 'shield'),
  ('Elevator', 'Building', 'arrow-up-down'),
  ('Central AC', 'Utilities', 'snowflake'),
  ('Balcony', 'Interior', 'panel-top'),
  ('Furnished', 'Interior', 'sofa'),
  ('Pet Friendly', 'Policy', 'paw-print'),
  ('Near School', 'Location', 'school'),
  ('Near Transit', 'Location', 'train'),
  ('Backup Power', 'Utilities', 'battery-charging')
on conflict (name) do update
set category = excluded.category,
    icon = excluded.icon;
