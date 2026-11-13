import { loadEncryptedConnections } from './server/connection-vault.js';
import { getAemAuthHeaders } from './server/aem-client.js';
const targets = await loadEncryptedConnections();
const target = targets.find((item) => item.baseUrl === 'http://localhost:4502' && item.role === 'author');
if (!target) throw new Error('Local author connection not found.');
const paths = [
'/apps/scotia/components/content/dynamicNavigation/dynamicNavigation.html',
'/apps/scotia/components/content/dynamicNavigation/clientlib/css/dynamicNavigation.css',
'/apps/scotia/components/content/dynamicNavigation/clientlib/js/dynamicNavigation.js',
'/apps/scotia/components/content/dynamicNavigation/clientlib/css.txt',
'/apps/scotia/components/content/dynamicNavigation/clientlib/js.txt',
'/apps/scotia/components/content/videoCarousel/videoCarousel.html',
'/apps/scotia/components/content/videoCarousel/clientlib/css/videoCarousel.css',
'/apps/scotia/components/content/videoCarousel/clientlib/js/videoCarousel.js',
'/apps/scotia/components/content/videoCarousel/clientlib/css.txt',
'/apps/scotia/components/content/videoCarousel/clientlib/js.txt'
];
for (const path of paths) {
  try {
    const response = await fetch(new URL(path, target.baseUrl), { headers: getAemAuthHeaders(target), redirect: 'manual', signal: AbortSignal.timeout(10000) });
    const body = await response.text();
    console.log('\n===== ' + path + ' | HTTP ' + response.status + ' | ' + (response.headers.get('content-type') || '') + ' | bytes=' + body.length + ' =====');
    console.log(body.slice(0, 5000));
  } catch (error) { console.log('\n===== ' + path + ' | ERROR ' + error.message + ' ====='); }
}