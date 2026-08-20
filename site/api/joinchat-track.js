// The WhatsApp widget beacons a click to WordPress' REST route. Nothing
// consumes it now, but answering 204 keeps the widget's settings byte-identical
// to the live site instead of leaving a 404 in the console.
export default function handler(req, res) {
  res.status(204);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}
