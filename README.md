# MALUCA — recortes

Instrumento visual para interpretar en vivo [MALUCA](https://www.youtube.com/watch?v=2mUFcVPyg28), de WEED420. Corre en el navegador con three.js.

Los recortes son agentes. No hay un jefe ni una secuencia atada a la canción. La música suena en otra ventana. Tú escuchas y decides cuándo cambiar el campo, el pegamento o el grupo.

## Cómo abrirlo

```bash
npm install
npm run dev
```

Abre la dirección que muestra la terminal. `F` pone la página en pantalla completa. `H` oculta el texto.

## Qué hace cada gesto

| Gesto | Qué cambia |
| --- | --- |
| Q / A | Peso del campo. Las curvas del recuerdo tiran más o menos. |
| T / G | Escala del campo. Menudo es nervioso; amplio es una curva larga. |
| W / S | Pegamento. También decide si la mancha se queda o se borra. |
| E / D | Grupo. También agranda o achica el radio: a quién alcanzan a ver. |
| Z | Agrio. Los ángulos se quiebran cada 45° y los colores se enfrían. |
| Ratón | Dobla el campo cerca de la mano y deja pegamento. |
| Clic | El campo cercano apunta hacia afuera: los recortes se apartan. |
| R | Otro campo, los mismos recortes. |
| C | Borra la mancha. |

## Qué percibe cada recorte

- **Campo:** solo el ángulo de la celda donde está parado.
- **Pegamento:** tres puntos del rastro — adelante, izquierda y derecha — y gira hacia el más fuerte.
- **Grupo:** los otros recortes que entran en su radio. Se aparta, se alinea y se acerca. La separación pesa un poco más, para que no se amontonen en una mancha sola.
- **Mano:** no les da una orden. Cambia el ángulo del campo a su alrededor. Ellos siguen leyendo una sola celda.

La fuerza es la de Reynolds: velocidad deseada menos velocidad actual, con un tope. Los pesos mezclan campo, pegamento y grupo.
