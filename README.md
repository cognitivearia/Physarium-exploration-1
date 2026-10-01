# MALUCA — recortes

Instrumento visual para interpretar en vivo [MALUCA](https://www.youtube.com/watch?v=2mUFcVPyg28), de WEED420. Corre en el navegador con three.js.

Hay dos poblaciones y ningún jefe. El moho son muchas partículas entre la hoja y los recortes. Cada una huele tres puntos, gira hacia el más fuerte y deja olor. Lo que se ve no es ese olor: es el trazo donde están ahora, negro y definido. Con las flechas, o con 1–4, cambias el estado y la figura se arma de otro modo: red, nudos, cordones o ramas. Los recortes son menos, para dejar sitio al moho. La música suena en otra ventana.

## Cómo abrirlo

La versión para probar está en GitHub Pages:

https://cognitivearia.github.io/Physarium-exploration-1/

`F` pone la página en pantalla completa. `H` oculta el texto.

Para trabajar en local:

```bash
npm install
npm run dev
```

Cuando el cambio llega a la rama `main`, GitHub construye el sitio y actualiza esa dirección.

## Qué hace cada gesto

| Gesto | Qué cambia |
| --- | --- |
| Q / A | Peso del campo. Las curvas del recuerdo tiran más o menos. |
| T / G | Escala del campo. Menudo es nervioso; amplio es una curva larga. |
| W / S | Pegamento. Cuánto siguen los recortes la mancha, y si esa mancha se queda. |
| E / D | Grupo. También agranda o achica el radio: a quién alcanzan a ver. |
| Flechas o 1 / 2 / 3 / 4 | Estado del moho. La figura anterior se suelta y nace la nueva: red, nudos, cordones o ramas. |
| Z | Agrio. Los ángulos se quiebran cada 45° y la copia se pone violeta. |
| Ratón | Sin clic, la mano alimenta el moho y dobla el campo a su alrededor. |
| Clic | Abre un hueco en la mancha. El campo cercano apunta hacia afuera. |
| R | Otro campo, los mismos recortes. |
| C | Borra la mancha. |

## Qué percibe el moho

Cada agente mira solo tres puntos de la mancha: adelante, a la izquierda y a la derecha. Gira hacia el más fuerte, da un paso y deja tinta. Si el centro es el más vacío, elige un lado al azar. No lee el campo ni mira a los recortes.

Antes de mirar, lee la tinta bajo sus pies. Esa tinta cambia cuatro cosas: a qué distancia huele, cuánto se abren los sensores, cuánto gira y cuánto avanza. Es el mismo algoritmo en los cuatro estados; cambian los números. El olor sí se apaga, para que el estado nuevo pueda nacer. El trazo que ves se queda mientras las partículas lo recorren.

La mano no les da una ruta. Sin clic deja comida y el trazo crece desde ahí. Con clic abre un hueco y los que están cerca giran hacia afuera.

## Qué percibe cada recorte

- **Campo:** solo el ángulo de la celda donde está parado.
- **Pegamento:** tres puntos del rastro — adelante, izquierda y derecha — y gira hacia el más fuerte.
- **Grupo:** los otros recortes que entran en su radio. Se aparta, se alinea y se acerca. La separación pesa un poco más, para que no se amontonen en una mancha sola.
- **Mano:** no les da una orden. Cambia el ángulo del campo a su alrededor. Ellos siguen leyendo una sola celda.

La fuerza es la de Reynolds: velocidad deseada menos velocidad actual, con un tope. Los pesos mezclan campo, pegamento y grupo.
