# GA4 - Reportes y embudos recomendados (Las Blancas)

Esta guia te deja 3 exploraciones listas para medir uso real del portal.

## 0) Verificacion previa

- En `.env` debe existir `VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXX`.
- El sitio ya envia eventos:
  - `portal_login`
  - `portal_logout`
  - `portal_tab_view`
  - `portal_nav_click`
  - `dashboard_cta_click`
  - `proposal_submit`
  - `proposal_to_survey`
  - `survey_publish`
  - `vote_submit`
  - `fund_publish`
  - `portal_action`
- Publica cambios y prueba navegacion real por 10-20 minutos.

## 1) Embudo de participacion en votaciones

Objetivo: saber cuanta gente llega a votar y en que paso se cae.

### Exploracion GA4

- Ir a `Explorar` > `Embudo`.
- Nombre: `Embudo - Votaciones`.
- Tipo: `Embudo cerrado`.

### Pasos del embudo

1. `portal_login`
2. `portal_tab_view` con parametro `tab_name = initiatives`
3. `vote_submit`

### Segmentos sugeridos

- Por rol (`role`): `resident`, `admin`, `superadmin`.
- Comparar periodos: ultimos 7 dias vs 28 dias.

### KPI clave

- Conversion login -> voto.
- Tasa de abandono en paso 2 (entran al portal pero no van a Votaciones).

## 2) Embudo de propuestas a votacion

Objetivo: medir si el muro de propuestas se convierte en encuestas reales.

### Exploracion GA4

- Ir a `Explorar` > `Embudo`.
- Nombre: `Embudo - Propuesta a Encuesta`.
- Tipo: `Embudo abierto` (pueden entrar en paso intermedio).

### Pasos del embudo

1. `portal_tab_view` con `tab_name = proposals`
2. `proposal_submit` (modo `new`)
3. `proposal_to_survey`
4. `survey_publish` (modo `new` o `edit`)

### KPI clave

- Tasa propuesta -> conversion a encuesta.
- Tiempo promedio entre propuesta y conversion (se calcula con comparacion temporal de eventos).

## 3) Embudo comercial interno (interes en fondos)

Objetivo: validar interes de usuarios en Proyectos y Fondos.

### Exploracion GA4

- Ir a `Explorar` > `Embudo`.
- Nombre: `Embudo - Interes en Fondos`.
- Tipo: `Embudo abierto`.

### Pasos del embudo

1. `dashboard_cta_click` con `cta = go_funds`
2. `portal_tab_view` con `tab_name = funds`
3. `fund_publish` (principalmente admins)

### KPI clave

- CTR del CTA del resumen hacia fondos.
- Frecuencia de creacion/edicion de proyectos.

## 4) Dashboard recomendado en GA4 (resumen ejecutivo)

En `Informes` > `Biblioteca` (o paneles personalizados), incluir:

- Usuarios activos (7/28 dias).
- Eventos por seccion:
  - `portal_tab_view` desglosado por `tab_name`.
- Top acciones:
  - `portal_action` por `action_name`.
- Conversiones:
  - `vote_submit`
  - `proposal_submit`
  - `proposal_to_survey`
  - `fund_publish`

## 5) Convenciones para mantener orden

- No crear eventos nuevos sin prefijo `portal_` o nombre funcional claro.
- Mantener nombres de parametros cortos y estables:
  - `tab_name`, `role`, `mode`, `cta`, `initiative_id`.
- Evitar datos personales en parametros de eventos.

## 6) Lectura de negocio (rapida)

- Si `portal_login` alto y `portal_tab_view initiatives` bajo:
  - mejorar CTA en Inicio/Resumen hacia Votaciones.
- Si `proposal_submit` alto y `proposal_to_survey` bajo:
  - revisar proceso administrativo de conversion.
- Si `funds` alto y `fund_publish` bajo:
  - hay interes, pero falta capacidad operativa de admins.

