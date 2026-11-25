# Mi Progreso — actualización V1.1

Esta actualización añade una primera capa de gamificación al gestor personal existente. Está pensada para instalarse encima de la V1.0 que ya está conectada a Supabase.

## Cambios incluidos

### Progresión de experiencia

El XP sigue acumulándose desde `personal_xp_events`; no se reinician ni se recalculan los puntos ya obtenidos. Lo que cambia es el costo para subir de nivel:

- Nivel 1 → 2: 100 XP.
- Nivel 2 → 3: 125 XP.
- Nivel 3 → 4: 150 XP.
- El requisito aumenta 25 XP por cada nivel nuevo.

Los rangos se desbloquean al alcanzar determinados niveles:

| Rango | Nivel requerido | XP acumulado requerido |
|---|---:|---:|
| Iniciado | 1 | 0 |
| Aprendiz | 3 | 225 |
| Explorador | 5 | 550 |
| Constante | 8 | 1.225 |
| Disciplinado | 11 | 2.125 |
| Veterano | 14 | 3.250 |
| Élite | 17 | 4.600 |
| Maestro | 21 | 6.750 |
| Leyenda | 26 | 10.000 |
| Mítico | 31 | 13.875 |

Los valores de XP que se entregan por completar tareas y hábitos no cambian en esta actualización.

### Avatares

Se incorporan 12 avatares iniciales basados en emoji. La elección se guarda en los metadatos de la cuenta autenticada de Supabase mediante `auth.updateUser({ data })`, así que se mantiene al iniciar sesión desde otro dispositivo. Estos datos solo se utilizan para presentación visual; no se usan para permisos ni seguridad.

### Dificultad visual

Las tareas y hábitos muestran etiquetas de dificultad con colores consistentes:

- Fácil: verde.
- Media: azul.
- Difícil: naranja.
- Muy difícil: rojo.

Las filas de tareas también incorporan una línea lateral del color correspondiente.

### Gráfico de hábitos

Se agrega un gráfico de línea de cumplimiento semanal con selector de 4, 8 o 12 semanas. El porcentaje compara los registros existentes con las instancias esperadas según la frecuencia configurada en cada hábito: diaria, lunes a viernes o semanal.

El gráfico se calcula con `personal_habits` y `personal_habit_logs`. No necesita datos externos ni una nueva tabla. Como el sistema no guarda un historial de cambios de frecuencia, el gráfico histórico utiliza la frecuencia actual de cada hábito para interpretar sus semanas anteriores.

## Instalación en GitHub

Descomprime este paquete y copia estos tres archivos a la raíz del repositorio `gestor-personal`, reemplazando los existentes:

- `index.html`
- `app.js`
- `styles.css`

Después realiza `commit` y `push` a la rama `main`. GitHub Pages publicará la actualización.

**No reemplaces `supabase-config.js`.** Conserva el archivo que ya contiene la URL y la publishable key de tu proyecto. Tampoco es necesario reemplazar `auth.js`, `login.html`, `login.css` ni `theme.js`.

## Supabase y base de datos

- No se modifica el esquema PostgreSQL.
- No se crean ni eliminan tablas.
- No ejecutes nuevamente `01_personal_schema.sql`.
- Las tareas, hábitos, registros y eventos de XP existentes se conservan.

Esta versión no usa claves privadas. La publishable key permanece en el archivo de configuración existente, y las operaciones de datos siguen protegidas por las políticas RLS que ya tienes configuradas.
