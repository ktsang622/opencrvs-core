import { Request, ResponseToolkit } from '@hapi/hapi';
import { readFileSync } from 'fs';
import { join } from 'path';

export const familyTreeUIHandler = async (request: Request, h: ResponseToolkit) => {
  const { personId } = request.params;
  const { fulldetails } = request.query;
  
  try {
    // Read the HTML template
    const htmlPath = join(__dirname, 'showMap.html');
    let html = readFileSync(htmlPath, 'utf8');
    
    // Replace personId in the script
    html = html.replace('window.location.pathname.split(\'/\').pop()', `'${personId}'`);
    
    return h.response(html).type('text/html');
  } catch (error) {
    console.error('Error loading family tree UI:', error);
    return h.response('Error loading family tree').code(500);
  }
};