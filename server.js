const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 8080;

// Serve static files from 'public' directory
app.use(express.static('public'));

// Proxy endpoint
app.get('/proxy', async (req, res) => {
  const targetUrl = req.query.url;

  // Validate URL
  if (!targetUrl || !isValidUrl(targetUrl)) {
    return res.status(400).send('Invalid URL');
  }

  try {
    // Fetch the target URL
    const proxyResponse = await fetch(targetUrl);

    // Get the content type
    const contentType = proxyResponse.headers.get('content-type') || '';

    // Process the response based on content type
    if (contentType.includes('text/html')) {
      const html = await proxyResponse.text();
      const $ = cheerio.load(html);

      // Rewrite all URLs in the HTML to go through the proxy
      $('a[href], link[href], script[src], img[src], form[action], iframe[src]').each((_, element) => {
        const attributes = ['href', 'src', 'action'];
        attributes.forEach(attr => {
          const value = $(element).attr(attr);
          if (value) {
            $(element).attr(attr, rewriteUrl(value, targetUrl));
          }
        });
      });

      // Inject JavaScript to handle link clicks, form submissions, and dynamic navigation
      $('body').append(`
        <script>
          // Intercept all link clicks
          document.addEventListener('click', function(event) {
            const link = event.target.closest('a');
            if (link) {
              event.preventDefault();
              const url = link.getAttribute('href');
              navigateTo(url);
            }
          });

          // Intercept all form submissions
          document.addEventListener('submit', function(event) {
            const form = event.target.closest('form');
            if (form) {
              event.preventDefault();
              const url = form.getAttribute('action');
              const method = form.getAttribute('method') || 'GET';
              const formData = new FormData(form);
              const params = new URLSearchParams(formData).toString();

              fetch(method === 'POST' ? url : \`\${url}?\${params}\`, {
                method: method,
                body: method === 'POST' ? params : null
              })
                .then(response => response.text())
                .then(html => {
                  document.documentElement.innerHTML = html;
                });
            }
          });

          // Handle dynamic navigation (e.g., JavaScript-based links)
          function navigateTo(url) {
            window.history.pushState({}, '', url);
            fetch(url)
              .then(response => response.text())
              .then(html => {
                document.documentElement.innerHTML = html;
              });
          }

          // Handle back/forward navigation
          window.addEventListener('popstate', function() {
            fetch(window.location.href)
              .then(response => response.text())
              .then(html => {
                document.documentElement.innerHTML = html;
              });
          });

          // Reattach event listeners after dynamic content updates
          function reattachListeners() {
            document.querySelectorAll('a').forEach(link => {
              link.addEventListener('click', function(event) {
                event.preventDefault();
                navigateTo(link.getAttribute('href'));
              });
            });
          }

          // Initial attachment of event listeners
          reattachListeners();
        </script>
      `);

      // Send the modified HTML
      return res.set('Content-Type', 'text/html').send($.html());
    }

    // For other content types (images, JSON, etc.), stream the response
    res.set('Content-Type', contentType);
    proxyResponse.body.pipe(res);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).send('Proxy error');
  }
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Helper functions
function rewriteUrl(url, baseUrl) {
  try {
    // Convert relative URLs to absolute URLs
    if (!url.startsWith('http')) {
      url = new URL(url, baseUrl).href;
    }
    // Rewrite the URL to go through the proxy
    return `/proxy?url=${encodeURIComponent(url)}`;
  } catch {
    return url;
  }
}

function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}