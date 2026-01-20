# seed_liquidaciones.py
from models import db, Hub, LiquidacionRuta

ROUTES_BY_HUB = {
    "Dibecesa": ["011", "002", "004", "007"],
    "Cordoba": ["07", "70", "31"],
    "Madrid Puerta Toledo": ["005", "006", "007", "17", "31"],
    "Cartagena": ["155"],
    "Vitoria": ["08", "09", "10"],
    "Cadiz": ["104", "141", "147", "156", "157", "164", "165"],
    "Caceres": ["103", "143", "310", "320", "340", "350"],
}

def seed_liquidaciones():
    """
    Seed de hubs + rutas de liquidaciones.
    IMPORTANT: este archivo NO importa app (evita import circular).
    Debe ejecutarse dentro de un app.app_context() desde app.py o desde un runner.
    """
    for hub_name, routes in ROUTES_BY_HUB.items():
        hub = Hub.query.filter_by(name=hub_name).first()

        if not hub:
            hub = Hub(name=hub_name)
            db.session.add(hub)
            db.session.commit()
            print(f"✅ Hub creado: {hub_name}")

        for code in routes:
            exists = LiquidacionRuta.query.filter_by(hub_id=hub.id, code=code).first()
            if exists:
                print(f"↪ Ruta ya existe: {hub_name} - {code}")
                continue

            r = LiquidacionRuta(hub_id=hub.id, code=code, active=True)
            db.session.add(r)
            print(f"➕ Ruta creada: {hub_name} - {code}")

    db.session.commit()
    print("\n🎉 Seed de rutas de liquidaciones completado")

