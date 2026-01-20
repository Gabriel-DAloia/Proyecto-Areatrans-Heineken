from app import app
from models import db, Hub, Employee, AsistenciasComment, LiquidacionRuta, LiquidacionEntry
from sqlalchemy import func

def find_hub_by_name_ci(name: str):
    return Hub.query.filter(func.lower(Hub.name) == func.lower(name)).first()

def merge_hubs(from_name: str, to_name: str):
    """
    Mueve todo de from_name -> to_name y borra el HUB duplicado.
    """
    src = find_hub_by_name_ci(from_name)
    dst = find_hub_by_name_ci(to_name)

    if not src:
        print(f"⏭ No existe: {from_name}")
        return
    if not dst:
        print(f"❌ No existe destino: {to_name}")
        return
    if src.id == dst.id:
        print(f"✅ Ya es el mismo HUB: {to_name}")
        return

    # Employees
    Employee.query.filter_by(hub_id=src.id).update({"hub_id": dst.id})

    # Comments
    AsistenciasComment.query.filter_by(hub_id=src.id).update({"hub_id": dst.id})

    # Liquidacion routes
    LiquidacionRuta.query.filter_by(hub_id=src.id).update({"hub_id": dst.id})

    db.session.delete(src)
    db.session.commit()
    print(f"✅ Fusionado: '{from_name}' -> '{to_name}'")

def run():
    with app.app_context():
        # fusiona todos los "Hub X" -> "X" si ambos existen
        hubs = Hub.query.all()
        for h in hubs:
            if h.name.lower().startswith("hub "):
                base = h.name[4:].strip()
                if find_hub_by_name_ci(base):
                    merge_hubs(h.name, base)

if __name__ == "__main__":
    run()
