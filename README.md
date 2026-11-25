# Mi Progreso V1.6

Aplicación estática HTML/CSS/JavaScript conectada a Supabase Auth, PostgreSQL y Storage. Esta versión incorpora categorías compartidas entre tareas y hábitos, color personalizado por categoría y filtros analíticos.

## Instalar V1.6

1. Haz una copia de seguridad del repositorio actual.
2. En Supabase → SQL Editor, ejecuta `01_migration_v1_6.sql` una sola vez. No vuelvas a ejecutar las migraciones V1.2–V1.5.
3. Reemplaza `index.html`, `app.js` y `styles.css` en la raíz del repositorio.
4. Conserva tu `supabase-config.js` real y los archivos actuales de autenticación, tema y login.
5. Haz commit y push a `main`.
6. Recarga GitHub Pages con `Ctrl + F5`.

## Qué cambia

### Categorías compartidas

Las categorías pueden utilizarse tanto en tareas como en hábitos. En el formulario de categoría puedes establecer nombre y color. Puedes editar ambos valores desde el panel “Tus categorías” en Tareas. Las categorías eliminadas se desvinculan de tareas y hábitos sin borrar registros, subtareas, XP ni historial.

### Tareas

- El formulario de tarea permite seleccionar categoría.
- Las tarjetas usan el color de la categoría.
- La complejidad se indica con símbolos: ○ Fácil, ◐ Media, ◆ Difícil y ★ Muy difícil.
- El filtro de tareas por categoría se mantiene.

### Hábitos

- El formulario de hábito permite asignar categoría.
- Las tarjetas se agrupan visualmente por categoría.
- Se puede filtrar el listado por categoría.
- El color de cada tarjeta sigue el color de su categoría.
- El icono de dificultad es independiente del color.

### Gráficos

Los gráficos de Resumen y Hábitos permiten filtrar por categoría, hábito y período de 4, 8 o 12 semanas. Cuando se filtra una categoría (o un hábito con categoría asignada), la línea del gráfico utiliza ese color para relacionar los datos con el grupo seleccionado. “Todas las categorías” incluye todos los hábitos; “Sin categoría” permite revisar los hábitos aún no clasificados. Si se elige una categoría, el selector de hábito muestra únicamente los hábitos de esa categoría.

## Migración SQL

`01_migration_v1_6.sql` es incremental y no destructiva. Añade `category_id` a `personal_habits`, crea una clave foránea con `ON DELETE SET NULL`, un índice y un trigger que impide asociar un hábito a una categoría de otro usuario. No modifica XP, misiones, logros, avatar ni revisiones semanales.

Las categorías se almacenan en `public.personal_categories`, una tabla que ya existía. El color ya se guardaba en esa tabla para tareas; esta versión agrega el mismo uso a los hábitos. Los hábitos que ya existían quedan sin categoría hasta que se editen.

## Seguridad

- Se mantiene RLS de las tablas personales.
- Las categorías siguen siendo propiedad de cada usuario.
- El trigger valida en PostgreSQL la relación entre el usuario del hábito y la categoría.
- `supabase-config.js` debe contener únicamente Project URL y publishable key. Nunca publiques `sb_secret`, `service_role` ni la contraseña de PostgreSQL.

## Validación realizada

Se revisaron sintaxis de JavaScript, estructura HTML, IDs duplicados, referencias estáticas de selectores, parser CSS e integridad del ZIP. La migración no se ha ejecutado contra tu base real; haz primero una copia de seguridad y ejecuta el script en Supabase.
