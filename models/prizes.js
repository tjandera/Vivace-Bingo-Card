/* models/prizes.js
   Prize tier data.  Each prize unlocks once the visitor has collected
   `stampsRequired` booth stamps.  With 12 booths, the natural cadence is
   one prize per 4 stamps: A at 4, B at 8, C at 12.

   `image` points to a file inside public/ — drop your product photos in
   at these paths and they render automatically.  If the file is missing,
   the view shows a subtle gift-box placeholder instead. */

const prizes = [
    {
        id:             1,
        label:          "Prize A",
        image:          "/images/prize-1.png",
        stampsRequired: 4,
    },
    {
        id:             2,
        label:          "Prize B",
        image:          "/images/prize-2.png",
        stampsRequired: 8,
    },
    {
        id:             3,
        label:          "Prize C",
        image:          "/images/prize-3.png",
        stampsRequired: 12,
    },
];

module.exports = { prizes };
