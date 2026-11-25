# Smart Meter Texas

## Descripción

Esta integración conecta Gladys con [Smart Meter Texas](https://www.smartmetertexas.com),
el portal donde las distribuidoras de Texas (Oncor, CenterPoint, AEP Texas, TNMP) publican
los datos de los contadores eléctricos inteligentes del mercado ERCOT. Es una integración
**en la nube**, disponible solo en **Estados Unidos** (Texas).

Para cada contador de su cuenta, Gladys obtiene un dispositivo con tres funciones de solo
lectura:

- **Lectura del contador** (kWh), de una lectura bajo demanda;
- **Consumo de ayer** (kWh), de los datos cada 15 minutos;
- **Excedente de generación de ayer** (kWh): la energía que sus paneles solares vertieron a
  la red.

También añade:

- **Disparadores de escena**: _Nueva lectura del contador_ (con la energía consumida desde la
  lectura anterior), _Consumo diario disponible_ y _Lectura fallida_;
- **Acciones de escena**: _Leer un contador_ y _Obtener el consumo de un día pasado_, cuyos
  resultados pueden usar las acciones siguientes de la escena;
- **Un widget del panel**: lectura, consumo de ayer, gráfico por horas y un botón
  **Leer ahora**.

## Requisitos

- Gladys Assistant 5.3.0 o posterior.
- Una cuenta de Smart Meter Texas (gratuita, creada en smartmetertexas.com con el ESI ID y el
  número de contador de su factura). Las credenciales de su proveedor de electricidad **no**
  sirven aquí.

## Configuración

1. Abra **Integraciones → Smart Meter Texas → Configuración**.
2. Introduzca el **usuario** y la **contraseña** de su cuenta de Smart Meter Texas.
3. Si lo desea, cambie el **intervalo de lectura** (60 minutos por defecto, 30 como mínimo) y
   la opción de **consumo de ayer**.
4. Pulse **Probar la conexión**: se muestra el número de contadores de la cuenta.
5. Abra la pestaña **Descubrir** y añada sus contadores.

Una lectura bajo demanda tarda de unos segundos a cinco minutos, y Smart Meter Texas solo
permite **dos lecturas por contador y por hora**: la integración rechaza una segunda lectura
en menos de 30 minutos. Los datos cada 15 minutos de un día suelen publicarse al día
siguiente, a veces dos días después.

## Solución de problemas

- **«Smart Meter Texas rechazó el usuario o la contraseña»**: inicie sesión en
  smartmetertexas.com con las mismas credenciales; el portal bloquea la cuenta tras varios
  intentos fallidos.
- **«Smart Meter Texas está limitando las solicitudes»**: demasiados accesos o lecturas;
  espere una hora.
- **Sin lectura tras 5 minutos**: el contador no respondió; la próxima lectura programada lo
  intentará de nuevo. El disparador _Lectura fallida_ permite recibir un aviso.
- **El consumo de ayer sigue vacío**: la distribuidora aún no ha publicado los datos; la
  integración lo reintenta en cada intervalo.
- Gladys guarda su contraseña como secreto y nunca la escribe en los registros.
