# Corregir subida GPX y mostrar fuentes en el mapa

## Cambios
- Corregir el selector de archivo para que «Subir GPX» abra el archivo de forma fiable también en la versión publicada.
- Al cargar el GPX, buscar inmediatamente fuentes de agua potable cercanas y guardar el resultado con la ruta.
- Elevar el radio de proximidad de 150 a 200 metros tanto para el mapa como para el GPX descargado.
- Mostrar en el mapa marcadores diferenciados para las fuentes de agua junto a los puntos de carbohidratos.
- Mostrar el mensaje solicitado cuando no se encuentre ninguna fuente a menos de 200 m.
- Mantener los puntos de agua en la descarga sin volver a duplicarlos.

## Verificación
- Probar apertura del selector, carga de un GPX y actualización visible del mapa.
- Comprobar el estado sin fuentes y la descarga con puntos de carbohidratos y agua.
- Revisar la compilación y los errores de ejecución.

## Detalles técnicos
- Mantener la búsqueda en el navegador mediante Overpass/OpenStreetMap.
- Reutilizar las utilidades existentes de filtrado e inyección GPX, ampliándolas para devolver las fuentes encontradas.
