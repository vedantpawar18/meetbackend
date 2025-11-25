// generate_parcels_xml.js
const fs = require('fs');
const path = require('path');

function makeParcel(i) {
  // i: 1..100
  // weight pattern: (i % 20) + 0.3  => 0.3 .. 19.3 (covers Mail, Regular, Heavy)
  const weight = ((i % 20) + 0.3).toFixed(2);

  // value pattern: (i % 30) * 40 + 10  => 10 .. 1210
  // Make some guaranteed high-value items: if i % 11 === 0 set value > 1500
  let value = ( (i % 30) * 40 + 10 );
  if (i % 11 === 0) value = 1500 + i; // high-value triggers insurance
  if (i % 17 === 0) value = 2500 + i; // extra high-value cases
  // convert to integer
  value = Math.round(value);

  const dests = ['Berlin','Munich','Hamburg','Frankfurt','Stuttgart','Cologne','Dublin','Lisbon','Vienna','Zurich'];
  const destination = dests[i % dests.length];

  return {
    TrackingId: `PCL-${String(i).padStart(3,'0')}`,
    Weight: weight,
    Value: value,
    Destination: destination
  };
}

function generate(count = 100) {
  const parcels = [];
  for (let i = 1; i <= count; i++) {
    parcels.push(makeParcel(i));
  }

  const header = '<?xml version="1.0" encoding="UTF-8"?>\n<Container>\n';
  const footer = '</Container>\n';
  const body = parcels.map(p => {
    return `  <Parcel>
    <TrackingId>${p.TrackingId}</TrackingId>
    <Weight>${p.Weight}</Weight>
    <Value>${p.Value}</Value>
    <Destination>${p.Destination}</Destination>
  </Parcel>`;
  }).join('\n');

  return header + body + '\n' + footer;
}

const xml = generate(100);
const outPath = path.join(process.cwd(), 'Container_100.xml');
fs.writeFileSync(outPath, xml, 'utf8');
console.log(`Wrote ${outPath} (${xml.length} bytes)`);
