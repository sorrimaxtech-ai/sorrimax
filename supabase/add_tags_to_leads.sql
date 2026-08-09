alter table leads 
add column if not exists tags text[] default '{}';

-- Update existing leads to have empty array if null
update leads set tags = '{}' where tags is null;
