-- Towns that are not towns.
--
-- When the FFC results index gave only a department, the upsert substituted
-- the department's name for the town — so 3 804 races carried "Vendée" or
-- "Côtes-d'Armor" in the field the interface presents as where the race is
-- held. The department was never lost: it sits in department_code and
-- department_name. The substitution added nothing and asserted something
-- false, so it is cleared, and the scraper no longer makes it.

UPDATE races
SET city = 'Lieu à préciser'
WHERE city IS NOT NULL
  AND department_name IS NOT NULL
  AND lower(city) = lower(department_name);
