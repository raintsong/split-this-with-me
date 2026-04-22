from werkzeug.middleware.proxy_fix import ProxyFix
from app import create_app

app = create_app()

# Trust Railway's reverse proxy so Flask generates https:// URLs correctly
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

if __name__ == "__main__":
    app.run(debug=True)