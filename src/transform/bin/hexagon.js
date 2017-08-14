const assign = require('lodash/assign');
const each = require('lodash/each');
const forIn = require('lodash/forIn');
const isArray = require('lodash/isArray');
const map = require('lodash/map');
const {
  registerTransform
} = require('../../data-set');

const DEFAULT_OPTIONS = {
  as: [ 'x', 'y', 'count' ],
  bins: [ 30, 30 ], // Numeric vector giving number of bins in both horizontal and vertical directions
  sizeByCount: false // calculate bin size by binning count
  // fields: ['field0', 'field1'], // required
  // binWidth: [ 30, 30 ], Numeric vector giving bin width in both horizontal and vertical directions. Overrides bins if both set.
};
const SQRT3 = Math.sqrt(3);
const THIRD_PI = Math.PI / 3;
const ANGLES = [ 0, THIRD_PI, 2 * THIRD_PI, 3 * THIRD_PI, 4 * THIRD_PI, 5 * THIRD_PI ];

function distance(x0, y0, x1, y1) {
  return Math.sqrt((x0 - x1) * (x0 - x1) + (y0 - y1) * (y0 - y1));
}
function nearestBinsCenters(value, scale) {
  scale = scale / 2;
  const div = Math.floor(value / scale);
  const rounded = scale * (div + (div % 2 === 1 ? 1 : 0));
  const roundedScaled = scale * (div + (div % 2 === 1 ? 0 : 1));
  return [ rounded, roundedScaled ];
}
function generateBins(points, binWidth = [ 1, 1 ]) { // processing aligned data
  const bins = {};
  const [ binWidthX, binWidthY ] = binWidth;
  each(points, point => {
    const [ x, y ] = point;
    // step3.1: nearest two centers
    const [ xRounded, xRoundedScaled ] = nearestBinsCenters(x, binWidthX);
    const [ yRounded, yRoundedScaled ] = nearestBinsCenters(y, binWidthY);
    // step3.2: compare distances
    const d1 = distance(x, y, xRounded, yRounded);
    const d2 = distance(x, y, xRoundedScaled, yRoundedScaled);
    let binKey;
    let binX;
    let binY;

    if (d1 < d2) {
      binKey = `x${xRounded}y${yRounded}`;
      [ binX, binY ] = [ xRounded, yRounded ];
    } else {
      binKey = `x${xRoundedScaled}y${yRoundedScaled}`;
      [ binX, binY ] = [ xRoundedScaled, yRoundedScaled ];
    }
    bins[binKey] = bins[binKey] || {
      x: binX,
      y: binY,
      count: 0
    };
    bins[binKey].count ++;
  });
  return bins;
}

function transform(dataView, options) {
  // step1: get binWidth, etc.
  options = assign({}, DEFAULT_OPTIONS, options);
  const fields = options.fields;
  if (!isArray(fields) || fields.length !== 2) {
    throw new TypeError('Invalid option: fields');
  }
  const [ fieldX, fieldY ] = fields;
  const rangeFieldX = dataView.range(fieldX);
  const rangeFieldY = dataView.range(fieldY);
  const widthX = rangeFieldX[1] - rangeFieldX[0];
  const widthY = rangeFieldY[1] - rangeFieldY[0];
  let binWidth = options.binWidth || [];
  if (binWidth.length !== 2) {
    const [ binsX, binsY ] = options.bins;
    if (binsX <= 0 || binsY <= 0) {
      throw new TypeError('Invalid option: bins');
    }
    binWidth = [ widthX / binsX, widthY / binsY ];
  }
  // step2: align scale (squash Y)
  /*
   * binWidthX / binWidthY should be Math.sqrt3 / 1.5
   * -: binWidthX |: binWidthY
   *           3
   *           |
   *   4       |        2
   *           |
   *           |
   *   5----------------1
   *
   *           0
   */
  const yScale = 3 * binWidth[0] / (SQRT3 * binWidth[1]);
  // const yScale = binWidth[0] / (SQRT3 * binWidth[1]);
  const points = map(dataView.rows, row => [ row[fieldX], yScale * row[fieldY] ]);
  // step3: binning
  const bins = generateBins(points, [ binWidth[0], yScale * binWidth[1] ]);
  // step4: restore scale (for Y)
  const [ asX, asY, asCount ] = options.as;
  if (!asX || !asY || !asCount) {
    throw new TypeError('Invalid option: as');
  }
  const radius = binWidth[0] / SQRT3;
  const hexagonPoints = ANGLES.map(angle => [ Math.sin(angle) * radius, -Math.cos(angle) * radius ]);
  const result = [];
  let maxCount = 0;
  if (options.sizeByCount) {
    forIn(bins, bin => {
      if (bin.count > maxCount) {
        maxCount = bin.count;
      }
    });
  }
  forIn(bins, bin => {
    const { x, y, count } = bin;
    const row = {};
    row[asCount] = count;
    if (options.sizeByCount) {
      row[asX] = map(hexagonPoints, p => x + (bin.count / maxCount) * p[0]);
      row[asY] = map(hexagonPoints, p => (y + (bin.count / maxCount) * p[1]) / yScale);
    } else {
      row[asX] = map(hexagonPoints, p => x + p[0]);
      row[asY] = map(hexagonPoints, p => (y + p[1]) / yScale);
    }
    result.push(row);
  });

  dataView.rows = result;
}

registerTransform('bin.hexagon', transform);
registerTransform('bin.hex', transform);
registerTransform('hexbin', transform);
