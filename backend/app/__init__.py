import os
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from app.config import Config
from app.routes import curation_bp, feedback_bp


def create_app(config_class=Config):
    static_dist = os.environ.get(
        "STATIC_DIR",
        os.path.abspath(os.path.join(os.path.dirname(__file__), "../static_dist")),
    )

    if os.path.exists(static_dist):
        app = Flask(__name__, static_folder=static_dist, static_url_path="")
    else:
        app = Flask(__name__)

    app.config.from_object(config_class)

    # Enable CORS for frontend PWA integration
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # Register blueprints
    app.register_blueprint(curation_bp, url_prefix="/api")
    app.register_blueprint(feedback_bp, url_prefix="/api")

    @app.route("/api/health", methods=["GET"])
    def health_check():
        return (
            jsonify(
                {"status": "healthy", "llm_provider": app.config.get("LLM_PROVIDER")}
            ),
            200,
        )

    @app.route("/api/config", methods=["GET"])
    def client_config():
        return (
            jsonify({"spotify_client_id": app.config.get("SPOTIFY_CLIENT_ID", "")}),
            200,
        )

    if os.path.exists(static_dist):

        @app.route("/", defaults={"path": ""})
        @app.route("/<path:path>")
        def serve_spa(path):
            file_path = os.path.join(static_dist, path)
            if path and os.path.exists(file_path) and os.path.isfile(file_path):
                return send_from_directory(static_dist, path)
            return send_from_directory(static_dist, "index.html")

    return app
