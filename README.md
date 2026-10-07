# Globero IA

Quiero que me crees una web app que pueda utilizar en mi movil y ordenador para llevar toda la gestión de un equipo ciclista. Quiero que haya varios usuarios, que desde el dashboard interno se puedan crear. Quiero que cada usuario, en sus ajustes pueda conectar con su propio Strava e importar esos datos para realizar graficos. En ésta nueva pestaña de Actividades, si el usuario tiene Strava conectado y se recogen sus datos, en esta pestaña deberían aparecer las últimas 20 actividades, sean cuales sean, de Strava y realizar un gráfico con los datos de "Carga de Entrenamiento" y "Fatiga" utilizando sus datos de entrenamiento.

La aplicación debe indicar cuántos carbohidratos debo comer los días anteriores según mis preferencias, indicando en ellas el día que tengo competición o salida larga. El enfoque principal sería de carbohidratos pero debería de tener una opción para calorías totales y macronutrientes. El proveedor de IA debe de ser gratuito y sin restricción. Debería de tener autentificación del usuario para guardar datos personalizados y se deberían guardas los perfiles de cada usuario. En la parte de competiciones, el tipo siempre estará basado en los datos de ciclismo. Todos los carbohidratos deben basarse en ciclismo y podrías siempre consultar todo tipo de webs para obtener el mejor resultado según peso, edad, etc del usuario. Además en los ajustes de una nueva competición, se debería de agregar los campos de kilómetros y altitud acumulada y tener éstos datos en cuenta para el consumo de carbohidratos. También hay que tener en cuenta que todos los datos deben aparecer en español. En la pestaña de competición, se debería de poder editar una competición ya añadida y ajustar los cambios si se modifica, también se debe poder eliminar una competición. También debería de haber la posibilidad de subir un archivo .gpx con el Track de la competición y que se evaluará el Track incluyendo en qué punto, kilometro o tiempo se deben ir consumiendo los carbohidratos para poder realizar la competición. Debe existir una pantalla de inicio de sesión. En la pestaña de competición, una vez subido el archivo .gpx y creado el plan de nutrición debería ser posible crear un botón donde se pueda descargar el archivo .gpx con los waypoints incorporados de nutrición en los puntos kilométricos. En la pestaña de recetas debe mostrar un menú basado en x días antes de la competición o salida larga seleccionada para obtener los hidratos deseados según los datos personales del usuario y de la competición o salida .En cada una de las paginas debe existir unos accesos rápidos para ir a las otras páginas. Se debe crear también un backend donde se podrá elegir el color de los botones, iconos si fuesen necesarios y color y tipo de letra a mostrar. Además en el backend debe de tener una pestaña para añadir nuevos usuarios. Toda la aplicación debe ser responsive y lo más limpia posible. Que se visualice el tracks en un mapa junto al análisis de datos 4.el gpx se debe descargar con los waypoints de nutrición, indicando en cada waypoint la cantidad de carbohidratos a consumir, según el perfil del usuario, ejemplo "carbo 40gr", en el archivo 5. El backend debe administrar la configuración visual y la gestión de usuarios y datos. Utiliza el proveedor de IA que más se pueda utilizar de forma gratuita y que mejor se adapte a la aplicación 2.  La frecuencia de waypoints en GPX: ¿Cada X kilómetros, cada X minutos, o ambos?Ambos 3. Añade cualquier funcionalidad que consideres oportuna para mejorar la aplicación 

En en Backend sólo debe estar la parte de configuración. Todo el resto, perfil ciclista y Competiciones, etc debe de aparecer en Frontend 

En la parte de Perfil debe de haber un campo para seleccionar los días anteriores que se quieren para generar el Menú Pre-Carrera entre 1 y 5.

En el botón de Generar Menú Pre-Carrera, debe mostrar un menú, según los días seleccionados en el perfil del usuario, con "desayuno", "comida","merienda" y "cena".

Además, cada menú mostrado debería de tener un botón para "Ver Receta" y al pulsarlo se debería de mostrar una tarjeta donde incluya los ingredientes, la preparación del menú y los carbohidratos, proteinas, grasas y calorias de dicha receta. Además, el menú creado debe tener un botón para exportar a PDF

Bien, una vez generado el plan, en cada receta, además del botón "Ver Receta" debería de aparecer otro que ponga "Cambiar Receta". Si se pulsa "Cambiar Receta" debería cambiar esa receta por otra, ya que puede que el usuario sea intolerante, vegano, etc, o que no le guste algún elemento de esa receta mostrada. De ésta forma se cambiaría esa receta por otra de iguales características siguiendo el plan nutricional previsto

En las tarjeta de "Ver Receta", además de mostrar los ingredientes, la preparación y Macronutrientes, se debe incluir las cantidades. Por ejemplo "Pollo con arroz, Ingredientes: 50gr de pollo a la plancha y 80gr arroz"

En la pantalla principal del Frontend, las competiciones creadas tienen que tener un botón para "eliminar".

El menú creado para esa competición se debe de guardar de forma que al acceder a la competición vuelva a aparecer sin tener que realizar otra petición a la IA.

En la parte del Frontend. Si el usuario ha realizado la conexión con Strava, se podrán utilizar los datos de Strava para poder ajustar mejor los carbohidratos en el menú basándose en sus datos de perfil y los datos de sus entrenamientos, salidas y competiciones de Strava los cuales nos mostrarán el estado físico del usuario.

Autenticación: ¿Qué tipo prefieres?:
a) Email + contraseña

Strava: La integración con Strava requiere que crees una app en Strava Developers (https://www.strava.com/settings/api) para obtener Client ID y Client Secret. ¿Los tienes ya o quieres que lo deje preparado con variables de entorno para que los añadas después?:
Cada usuario deberá crear su propio Client ID y Client Secret

Backend de Configuración (panel admin): ¿Quieres que sea una ruta protegida con rol de "admin" dentro de la misma app (ej: /admin) donde solo ciertos usuarios pueden entrar a gestionar usuarios + apariencia visual? ¿Creo un usuario admin por defecto?:
Si, pero dentro del Backend se deben de poder crear nuevos usuarios y poder asignarles el rol de Usuario o Admin, en el caso de ser Admin podrá acceder al Backend. El usuario admin principal será "mikigarcia25@hotmail.com" y password "Candela2018?"

Diseño visual inicial: ¿Alguna preferencia de estilo (claro/oscuro, colores del equipo, deportivo/minimalista) o lo decide el agente de diseño?:
Que lo decida el agente de diseño, de forma deportivo y minimalista basandose en la web del equipo https://sentmenatbici.cat/

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://globero.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/803cb06d-fc29-4646-b254-6a2f2dc03f29).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
