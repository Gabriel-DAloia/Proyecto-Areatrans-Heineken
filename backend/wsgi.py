from app import app
from models import db
from flask_migrate import Migrate

migrate = Migrate(app, db)
