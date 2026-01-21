from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    jwt_required,
    get_jwt_identity,
)
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import date
import calendar
import os

from models import db, User, Hub, Employee, Attendance, ExtraHours, AsistenciasComment, LiquidacionRuta, LiquidacionEntry, KilosLitros, FlotaVehiculo, HubCompra, FlotaIncidencia, Contacto, RepartoCliente, HeinekenPedido, LiquidacionRuta
from flask_migrate import Migrate
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func
from seed_liquidaciones import seed_liquidaciones
from datetime import datetime
from flask_jwt_extended import jwt_required
from uuid import uuid4
import requests
import time
import requests
from urllib.parse import urlencode
from flask_cors import CORS



   



app = Flask(__name__)
CORS(app, origins=[
  "https://areatrans-4d36a.web.app",
  "https://areatrans-4d36a.firebaseapp.com",
])

# ✅ En producción usa una variable de entorno y una clave MUY larga.
app.config["JWT_SECRET_KEY"] = "CAMBIA_ESTA_CLAVE_SUPER_SECRETA_123456"

# ✅ SQLite (archivo local)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "areatrans.db")
app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{DB_PATH}"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

# ✅ SQLAlchemy + Migrate (para que exista `flask db ...`)
db.init_app(app)
migrate = Migrate(app, db)

# ✅ JWT
jwt = JWTManager(app)

# Códigos permitidos
ALLOWED_CODES = {"", "1", "F", "D", "V", "E", "L", "O", "M", "C"}

with app.app_context():
    # NO uses create_all si ya trabajas con migrations
    # db.create_all()
    try:
        seed_liquidaciones()
    except Exception:
        # si no hay tablas aún (antes de upgrade), no rompe
        pass

def month_key(year: int, month: int) -> str:
    return f"{year:04d}-{month:02d}"


def parse_ymd(dt: str):
    """Devuelve (y,m,d) o None."""
    if len(dt) != 10 or dt[4] != "-" or dt[7] != "-":
        return None
    try:
        y = int(dt[0:4])
        m = int(dt[5:7])
        d = int(dt[8:10])
        calendar.monthrange(y, m)  # valida mes
        return y, m, d
    except Exception:
        return None


def get_or_create_hub(hub_name: str) -> Hub:
    """
    Si el HUB no existe, lo crea.
    (Si prefieres que NO se creen automáticamente, lo cambiamos luego.)
    """
    hub_name = hub_name.strip()
    hub = Hub.query.filter_by(name=hub_name).first()
    if hub:
        return hub
    hub = Hub(name=hub_name)
    db.session.add(hub)
    db.session.commit()
    return hub


def ensure_demo_admin():
    """✅ Admin demo (único default que dejamos). No usamos create_all() para no romper migraciones."""
    admin = User.query.filter_by(email="admin@demo.com").first()
    if not admin:
        admin = User(
            email="admin@demo.com",
            name="Admin",
            password_hash=generate_password_hash("123456"),
            role="admin",
            is_active=True,
        )
        db.session.add(admin)
        db.session.commit()


@app.before_request
def _ensure_admin_once():
    """
    Crea el admin demo cuando la BD ya tenga tablas (después de `flask db upgrade`).
    Si aún no existen, no rompe.
    """
    try:
        ensure_demo_admin()
    except Exception:
        pass


@app.get("/api/health")
def health():
    return jsonify(status="ok", message="Backend Flask + DB funcionando")


@app.get("/")
def home():
    return jsonify(message="Flask OK. Prueba /api/health"), 200


# =========================
# AUTH (DB)
# =========================

@app.post("/api/register")
def register():
    data = request.get_json(silent=True) or {}

    name = (data.get("name") or "").strip()
    last_name = (data.get("last_name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not name:
        return jsonify(error="El nombre es obligatorio"), 400
    if not last_name:
        return jsonify(error="El apellido es obligatorio"), 400
    if not email or "@" not in email:
        return jsonify(error="Correo electrónico inválido"), 400
    if len(password) < 6:
        return jsonify(error="La contraseña debe tener al menos 6 caracteres"), 400

    if User.query.filter_by(email=email).first():
        return jsonify(error="Ese correo ya está registrado"), 409

    full_name = f"{name} {last_name}"

    user = User(
        email=email,
        name=full_name,
        password_hash=generate_password_hash(password),
        role="user",
        is_active=True,
    )

    db.session.add(user)
    db.session.commit()

    return jsonify(
        message="Cuenta creada correctamente",
        user={"email": user.email, "name": user.name},
    ), 201


@app.post("/api/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    # ✅ Asegura admin demo (si la BD ya está migrada)
    try:
        ensure_demo_admin()
    except Exception:
        pass

    user = User.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify(error="Correo o contraseña incorrectos"), 401

    token = create_access_token(identity=email)

    return jsonify(
        message=f"Bienvenido, {user.name}",
        user={"email": user.email, "name": user.name},
        token=token,
    ), 200


@app.get("/api/me")
@jwt_required()
def me():
    email = get_jwt_identity()
    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify(error="Usuario no existe"), 404
    return jsonify(user={"email": user.email, "name": user.name}), 200


# ✅ Respuestas JSON para errores de JWT (para que React no se rompa)
@jwt.unauthorized_loader
def jwt_missing(reason):
    return jsonify(error="Falta token (Authorization: Bearer <token>)"), 401


@jwt.invalid_token_loader
def jwt_invalid(reason):
    return jsonify(error="Token inválido"), 401


@jwt.expired_token_loader
def jwt_expired(jwt_header, jwt_payload):
    return jsonify(error="Token expirado"), 401


# =========================
# Helpers
# =========================

def normalize_hub_name(name: str) -> str:
    name = (name or "").strip()
    name = " ".join(name.split())
    return name

def strip_hub_prefix(name: str) -> str:
    name = normalize_hub_name(name)
    if name.lower().startswith("hub "):
        return normalize_hub_name(name[4:])
    return name

def hub_candidates(hub_name: str):
    """
    Orden IMPORTANTE:
    - Si viene "Hub X": primero probamos "X" y luego "Hub X"
    - Si viene "X": primero "X" y luego "Hub X"
    """
    hub_name = normalize_hub_name(hub_name)
    no_prefix = strip_hub_prefix(hub_name)
    with_prefix = normalize_hub_name("Hub " + no_prefix)

    # preferimos SIEMPRE el no_prefix
    cands = [no_prefix, with_prefix]

    seen = set()
    out = []
    for c in cands:
        k = c.lower()
        if k not in seen:
            seen.add(k)
            out.append(c)
    return out

def get_or_create_hub(hub_name: str) -> Hub:
    hub_name = normalize_hub_name(hub_name)

    # 1) Buscar por candidatos (case-insensitive)
    for cand in hub_candidates(hub_name):
        row = Hub.query.filter(func.lower(Hub.name) == func.lower(cand)).first()
        if row:
            return row

    # 2) Crear SIEMPRE con nombre CANÓNICO (sin "Hub ")
    canonical = strip_hub_prefix(hub_name)
    row = Hub(name=canonical)
    db.session.add(row)
    try:
        db.session.commit()
        return row
    except IntegrityError:
        db.session.rollback()
        for cand in hub_candidates(hub_name):
            row = Hub.query.filter(func.lower(Hub.name) == func.lower(cand)).first()
            if row:
                return row
        raise


# ======================================================
#                   ASISTENCIAS (HUB)
# ======================================================
# ✅ Comentario inicio ASISTENCIAS: aquí empiezan las rutas del apartado Asistencias


@app.get("/api/hubs/<path:hub>/asistencias")
@jwt_required()
def asistencias_month(hub):
    year = int(request.args.get("year", date.today().year))
    month = int(request.args.get("month", date.today().month))
    key = month_key(year, month)
    days_in_month = calendar.monthrange(year, month)[1]

    hub_row = get_or_create_hub(hub)

    employees = (
        Employee.query.filter_by(hub_id=hub_row.id, active=True)
        .order_by(Employee.name.asc())
        .all()
    )

    start = f"{key}-01"
    end = f"{key}-{days_in_month:02d}"

    rows = []
    for emp in employees:
        att_rows = Attendance.query.filter(
            Attendance.employee_id == emp.id,
            Attendance.day >= start,
            Attendance.day <= end,
        ).all()
        att_map = {int(a.day[8:10]): a.code for a in att_rows}

        he_rows = ExtraHours.query.filter(
            ExtraHours.employee_id == emp.id,
            ExtraHours.day >= start,
            ExtraHours.day <= end,
        ).all()
        # guardamos solo las que tengan valor
        he_map = {str(int(h.day[8:10])): h.hours for h in he_rows if h.hours}

        days = {str(d): (att_map.get(d, "")) for d in range(1, days_in_month + 1)}

        total_trabajo = sum(1 for v in days.values() if v in ("1", "F"))
        total_festivos = sum(1 for v in days.values() if v == "F")
        total_descanso = sum(1 for v in days.values() if v == "D")
        total_vac = sum(1 for v in days.values() if v == "V")
        total_enf = sum(1 for v in days.values() if v == "E")

        rows.append(
            {
                "employee": {"id": str(emp.id), "name": emp.name},
                "days": days,
                "extra_hours": he_map,
                "totals": {
                    "trabajo": total_trabajo,
                    "descanso": total_descanso,
                    "vacaciones": total_vac,
                    "enfermedad": total_enf,
                    "festivos": total_festivos,
                },
            }
        )

    cm = AsistenciasComment.query.filter_by(hub_id=hub_row.id, month_key=key).first()
    comments = {
        "start": cm.comment_start if cm else "",
        "end": cm.comment_end if cm else "",
    }

    return jsonify(
        hub=hub,
        year=year,
        month=month,
        days_in_month=days_in_month,
        rows=rows,
        comments=comments,
        meta={"user": get_jwt_identity()},
    ), 200


@app.put("/api/hubs/<path:hub>/asistencias/<employee_id>/day")
@jwt_required()
def set_day(hub, employee_id):
    data = request.get_json(silent=True) or {}
    dt = (data.get("date") or "").strip()
    code = (data.get("code") or "").strip()

    if code not in ALLOWED_CODES:
        return jsonify(error=f"Código no permitido: {code}"), 400

    parsed = parse_ymd(dt)
    if not parsed:
        return jsonify(error="Fecha inválida, usa YYYY-MM-DD"), 400

    y, m, d = parsed
    dim = calendar.monthrange(y, m)[1]
    if d < 1 or d > dim:
        return jsonify(error="Día fuera de rango"), 400

    hub_row = get_or_create_hub(hub)

    emp = Employee.query.filter_by(
        id=int(employee_id),
        hub_id=hub_row.id,
        active=True
    ).first()
    if not emp:
        return jsonify(error="Empleado no existe en este HUB"), 404

    row = Attendance.query.filter_by(employee_id=emp.id, day=dt).first()

    if code == "":
        if row:
            db.session.delete(row)
            db.session.commit()
        return jsonify(ok=True), 200

    if not row:
        row = Attendance(employee_id=emp.id, day=dt, code=code)
        db.session.add(row)
    else:
        row.code = code

    db.session.commit()
    return jsonify(ok=True), 200


@app.put("/api/hubs/<path:hub>/asistencias/<employee_id>/extra-hours")
@jwt_required()
def set_extra_hours(hub, employee_id):
    data = request.get_json(silent=True) or {}
    dt = (data.get("date") or "").strip()
    hours = (data.get("hours") or "").strip()

    parsed = parse_ymd(dt)
    if not parsed:
        return jsonify(error="Fecha inválida, usa YYYY-MM-DD"), 400

    if hours != "":
        try:
            float(hours.replace(",", "."))
        except ValueError:
            return jsonify(error="Horas inválidas. Usa número, ejemplo: 0,5 o 1"), 400

    hub_row = get_or_create_hub(hub)

    emp = Employee.query.filter_by(
        id=int(employee_id),
        hub_id=hub_row.id,
        active=True
    ).first()
    if not emp:
        return jsonify(error="Empleado no existe en este HUB"), 404

    row = ExtraHours.query.filter_by(employee_id=emp.id, day=dt).first()

    if hours == "":
        if row:
            db.session.delete(row)
            db.session.commit()
        return jsonify(ok=True), 200

    if not row:
        row = ExtraHours(employee_id=emp.id, day=dt, hours=hours)
        db.session.add(row)
    else:
        row.hours = hours

    db.session.commit()
    return jsonify(ok=True), 200


@app.put("/api/hubs/<path:hub>/asistencias/comments")
@jwt_required()
def save_comments(hub):
    data = request.get_json(silent=True) or {}
    year = int(data.get("year", date.today().year))
    month = int(data.get("month", date.today().month))
    key = month_key(year, month)

    comment_start = (data.get("start") or "").strip()
    comment_end = (data.get("end") or "").strip()

    hub_row = get_or_create_hub(hub)

    row = AsistenciasComment.query.filter_by(hub_id=hub_row.id, month_key=key).first()
    if not row:
        row = AsistenciasComment(
            hub_id=hub_row.id,
            month_key=key,
            comment_start=comment_start,
            comment_end=comment_end,
        )
        db.session.add(row)
    else:
        row.comment_start = comment_start
        row.comment_end = comment_end

    db.session.commit()
    return jsonify(ok=True), 200


# ✅ Comentario fin ASISTENCIAS: aquí terminan las rutas del apartado Asistencias


# ======================================================
#              EMPLEADOS (Añadir / Eliminar)
# ======================================================

@app.post("/api/hubs/<path:hub>/employees")
@jwt_required()
def create_employee(hub):
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()

    if not name:
        return jsonify(error="Nombre requerido"), 400

    hub_row = get_or_create_hub(hub)

    exists = Employee.query.filter_by(hub_id=hub_row.id, name=name).first()
    if exists:
        return jsonify(error="Ese empleado ya existe en este HUB"), 409

    emp = Employee(hub_id=hub_row.id, name=name, active=True)
    db.session.add(emp)
    db.session.commit()

    return jsonify(employee={"id": str(emp.id), "name": emp.name}), 201


@app.delete("/api/hubs/<path:hub>/employees/<employee_id>")
@jwt_required()
def delete_employee(hub, employee_id):
    hub_row = get_or_create_hub(hub)

    emp = Employee.query.filter_by(
        id=int(employee_id),
        hub_id=hub_row.id,
        active=True
    ).first()
    if not emp:
        return jsonify(error="Empleado no encontrado"), 404

    # borrado lógico
    emp.active = False
    db.session.commit()

    return jsonify(ok=True), 200


# ======================================================
#                 LIQUIDACIONES (HUB)
# ======================================================

@app.get("/api/hubs/<path:hub>/liquidaciones/routes")
@jwt_required()
def liquidaciones_routes(hub):
    hub_row = get_or_create_hub(hub)

    routes = (
        LiquidacionRuta.query
        .filter_by(hub_id=hub_row.id, active=True)
        .order_by(LiquidacionRuta.code.asc())
        .all()
    )

    return jsonify(
        hub=hub_row.name,
        routes=[{"id": r.id, "code": r.code} for r in routes]
    ), 200


@app.post("/api/hubs/<path:hub>/liquidaciones/routes")
@jwt_required()
def liquidaciones_create_route(hub):
    data = request.get_json(silent=True) or {}
    code = (data.get("code") or "").strip()

    if not code:
        return jsonify(error="El código de ruta es obligatorio"), 400

    hub_row = get_or_create_hub(hub)

    exists = LiquidacionRuta.query.filter_by(
        hub_id=hub_row.id, code=code, active=True
    ).first()
    if exists:
        return jsonify(error="Esa ruta ya existe en este HUB"), 409

    r = LiquidacionRuta(hub_id=hub_row.id, code=code, active=True)
    db.session.add(r)
    db.session.commit()

    return jsonify(route={"id": r.id, "code": r.code}), 201


@app.get("/api/hubs/<path:hub>/liquidaciones")
@jwt_required()
def liquidaciones_month(hub):
    year = int(request.args.get("year", date.today().year))
    month = int(request.args.get("month", date.today().month))

    route_id = request.args.get("route_id")
    route_code = request.args.get("route_code")

    if not route_id and not route_code:
        return jsonify(error="route_id o route_code es obligatorio"), 400

    key = month_key(year, month)
    days_in_month = calendar.monthrange(year, month)[1]
    start = f"{key}-01"
    end = f"{key}-{days_in_month:02d}"

    hub_row = get_or_create_hub(hub)

    route = None
    if route_id:
        try:
            rid = int(route_id)
        except ValueError:
            return jsonify(error="route_id inválido"), 400

        route = LiquidacionRuta.query.filter_by(
            id=rid, hub_id=hub_row.id, active=True
        ).first()
    else:
        rc = (route_code or "").strip()
        route = LiquidacionRuta.query.filter_by(
            hub_id=hub_row.id, code=rc, active=True
        ).first()

    if not route:
        return jsonify(error="Ruta no encontrada en este HUB"), 404

    entries = (
        LiquidacionEntry.query
        .filter(
            LiquidacionEntry.route_id == route.id,
            LiquidacionEntry.day >= start,
            LiquidacionEntry.day <= end,
        )
        .all()
    )

    m = {int(e.day[8:10]): e for e in entries}

    rows = []
    for d in range(1, days_in_month + 1):
        e = m.get(d)
        rows.append({
            "day": f"{key}-{d:02d}",
            "repartidor": e.repartidor if e else "",
            "metalico": e.metalico if e else "",
            "ingreso": e.ingreso if e else "",
            "comment": e.comment if e else "",   # ✅ NUEVO
        })

    return jsonify(
        hub=hub_row.name,
        year=year,
        month=month,
        days_in_month=days_in_month,
        route={"id": route.id, "code": route.code},
        rows=rows
    ), 200


@app.put("/api/hubs/<path:hub>/liquidaciones")
@jwt_required()
def liquidaciones_save_month(hub):
    data = request.get_json(silent=True) or {}

    try:
        year = int(data.get("year"))
        month = int(data.get("month"))
    except Exception:
        return jsonify(error="year y month son obligatorios"), 400

    route_id = data.get("route_id")
    route_code = (data.get("route_code") or "").strip()
    rows = data.get("rows") or []

    if not route_id and not route_code:
        return jsonify(error="route_id o route_code es obligatorio"), 400

    hub_row = get_or_create_hub(hub)

    route = None
    if route_id:
        try:
            rid = int(route_id)
        except ValueError:
            return jsonify(error="route_id inválido"), 400
        route = LiquidacionRuta.query.filter_by(
            id=rid, hub_id=hub_row.id, active=True
        ).first()
    else:
        route = LiquidacionRuta.query.filter_by(
            hub_id=hub_row.id, code=route_code, active=True
        ).first()

    if not route:
        return jsonify(error="Ruta no encontrada en este HUB"), 404

    key = month_key(year, month)
    days_in_month = calendar.monthrange(year, month)[1]
    start = f"{key}-01"
    end = f"{key}-{days_in_month:02d}"

    existing = (
        LiquidacionEntry.query
        .filter(
            LiquidacionEntry.route_id == route.id,
            LiquidacionEntry.day >= start,
            LiquidacionEntry.day <= end,
        )
        .all()
    )
    ex_map = {e.day: e for e in existing}

    for r in rows:
        day = (r.get("day") or "").strip()
        repartidor = (r.get("repartidor") or "").strip()
        metalico = (r.get("metalico") or "").strip()
        ingreso = (r.get("ingreso") or "").strip()
        comment = (r.get("comment") or "").strip()  # ✅ NUEVO

        parsed = parse_ymd(day)
        if not parsed:
            return jsonify(error=f"Fecha inválida: {day}"), 400

        if metalico.strip():
            to_float_es(metalico)
        if ingreso.strip():
            to_float_es(ingreso)

        # ✅ si todo vacío (incluye comment) -> borrar
        if not repartidor and not metalico and not ingreso and not comment:
            if day in ex_map:
                db.session.delete(ex_map[day])
            continue

        if day in ex_map:
            e = ex_map[day]
            e.repartidor = repartidor
            e.metalico = metalico
            e.ingreso = ingreso
            e.comment = comment  # ✅ NUEVO
        else:
            e = LiquidacionEntry(
                route_id=route.id,
                day=day,
                repartidor=repartidor,
                metalico=metalico,
                ingreso=ingreso,
                comment=comment,  # ✅ NUEVO
            )
            db.session.add(e)

    db.session.commit()
    return jsonify(ok=True), 200


# ======================================================
# ✅ NUEVA RUTA: Guardar SOLO comentario (sin mandar toda la tabla)
# ======================================================
@app.put("/api/hubs/<path:hub>/liquidaciones/comment")
@jwt_required()
def liquidaciones_set_comment(hub):
    data = request.get_json(silent=True) or {}

    day = (data.get("day") or "").strip()
    comment = (data.get("comment") or "").strip()

    route_id = data.get("route_id")
    route_code = (data.get("route_code") or "").strip()

    if not day:
        return jsonify(error="day es obligatorio (YYYY-MM-DD)"), 400
    if not route_id and not route_code:
        return jsonify(error="route_id o route_code es obligatorio"), 400

    if not parse_ymd(day):
        return jsonify(error="Fecha inválida, usa YYYY-MM-DD"), 400

    hub_row = get_or_create_hub(hub)

    route = None
    if route_id:
        try:
            rid = int(route_id)
        except ValueError:
            return jsonify(error="route_id inválido"), 400

        route = LiquidacionRuta.query.filter_by(
            id=rid, hub_id=hub_row.id, active=True
        ).first()
    else:
        route = LiquidacionRuta.query.filter_by(
            hub_id=hub_row.id, code=route_code, active=True
        ).first()

    if not route:
        return jsonify(error="Ruta no encontrada en este HUB"), 404

    entry = LiquidacionEntry.query.filter_by(route_id=route.id, day=day).first()

    # si no existe fila aún, la creamos solo con comentario
    if not entry:
        entry = LiquidacionEntry(
            route_id=route.id,
            day=day,
            repartidor="",
            metalico="",
            ingreso="",
            comment=comment,
        )
        db.session.add(entry)
    else:
        entry.comment = comment

    db.session.commit()
    return jsonify(ok=True), 200

# ======================================================
# ✅ FLOTA
# ======================================================

def normalize_matricula(s: str) -> str:
    # Normaliza: trim, mayúsculas, colapsa espacios
    if not s:
        return ""
    s = str(s).strip().upper()
    s = " ".join(s.split())
    return s


ALLOWED_TIPOS = {"Moto", "camion", "trailer", "carrozado", "Mus", "furgoneta"}
# si quieres estrictamente con mayúscula inicial:
ALLOWED_TIPOS_CANON = {"Moto", "Camion", "Trailer", "Carrozado", "Mus", "Furgoneta"}

def canon_tipo(tipo: str) -> str:
    t = (tipo or "").strip()
    # Acepta varios estilos y devuelve canonical
    t_low = t.lower()
    mapping = {
        "moto": "Moto",
        "camion": "Camion",
        "trailer": "Trailer",
        "carrozado": "Carrozado",
        "mus": "Mus",
        "furgoneta": "Furgoneta",
    }
    return mapping.get(t_low, "")


@app.get("/api/hubs/<path:hub>/flota")
@jwt_required()
def flota_list(hub):
    hub_row = get_or_create_hub(hub)

    items = (
        FlotaVehiculo.query
        .filter_by(hub_id=hub_row.id, active=True)
        .order_by(FlotaVehiculo.matricula.asc())
        .all()
    )

    return jsonify(
        hub=hub_row.name,
        vehicles=[
            {"id": v.id, "matricula": v.matricula, "tipo": v.tipo}
            for v in items
        ],
    ), 200


def normalize_plate(raw: str) -> str:
    # Quita espacios y pone en mayúsculas. Mantén guiones si quieres.
    # Si quieres quitar guiones también: .replace("-", "")
    return (raw or "").strip().upper().replace(" ", "")

@app.post("/api/hubs/<path:hub>/flota")
@jwt_required()
def flota_add(hub):
    data = request.get_json(silent=True) or {}

    matricula = normalize_plate(data.get("matricula"))
    tipo = (data.get("tipo") or "").strip()

    if not matricula:
        return jsonify(error="La matrícula es obligatoria"), 400
    if not tipo:
        return jsonify(error="El tipo es obligatorio"), 400

    hub_row = get_or_create_hub(hub)

    # 1) Si ya existe ACTIVO -> 409 (no 500)
    exists_active = FlotaVehiculo.query.filter_by(
        hub_id=hub_row.id, matricula=matricula, active=True
    ).first()
    if exists_active:
        return jsonify(error="Ese vehículo ya existe en este HUB"), 409

    # 2) Si existe INACTIVO -> reactivar (clave para no chocar con UNIQUE)
    exists_inactive = FlotaVehiculo.query.filter_by(
        hub_id=hub_row.id, matricula=matricula, active=False
    ).first()
    if exists_inactive:
        exists_inactive.active = True
        exists_inactive.tipo = tipo
        db.session.commit()
        return jsonify(vehiculo={
            "id": exists_inactive.id,
            "matricula": exists_inactive.matricula,
            "tipo": exists_inactive.tipo,
        }), 200

    # 3) Si no existe -> crear normal
    try:
        v = FlotaVehiculo(
            hub_id=hub_row.id,
            matricula=matricula,
            tipo=tipo,
            active=True,
        )
        db.session.add(v)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        # Por si entraron dos requests a la vez o algo quedó raro
        return jsonify(error="Ese vehículo ya existe en este HUB"), 409

    return jsonify(vehiculo={"id": v.id, "matricula": v.matricula, "tipo": v.tipo}), 201



@app.delete("/api/hubs/<path:hub>/flota/<int:vehiculo_id>")
@jwt_required()
def flota_delete(hub, vehiculo_id):
    hub_row = get_or_create_hub(hub)

    v = FlotaVehiculo.query.filter_by(
        id=vehiculo_id, hub_id=hub_row.id, active=True
    ).first()

    if not v:
        return jsonify(error="Vehículo no encontrado"), 404

    v.active = False
    db.session.commit()
    return jsonify(ok=True), 200

# ======================================================
# COMENTARIOS Kilos/Litros (INICIO / FIN)
# ======================================================

@app.get("/api/hubs/<path:hub>/kiloslitros")
@jwt_required()
def kilos_litros_list(hub):
    hub_row = get_or_create_hub(hub)

    year = request.args.get("year", type=int)
    month = request.args.get("month", type=int)

    q = KilosLitros.query.filter_by(hub_id=hub_row.id, active=True)

    if year is not None:
        q = q.filter(KilosLitros.year == year)
    if month is not None:
        q = q.filter(KilosLitros.month == month)

    items = q.order_by(KilosLitros.day.asc(), KilosLitros.ruta_numero.asc()).all()

    totals = {
        "clientes": sum((i.clientes or 0) for i in items),
        "kilos": sum((i.kilos or 0) for i in items),
        "litros": sum((i.litros or 0) for i in items),
    }

    return jsonify(
        hub=hub_row.name,
        year=year,
        month=month,
        totals=totals,
        items=[
            {
                "id": i.id,
                "day": i.day,
                "year": i.year,
                "month": i.month,
                "ruta_numero": i.ruta_numero,
                "nombre": i.nombre,
                "clientes": i.clientes,
                "kilos": i.kilos,
                "litros": i.litros,
            }
            for i in items
        ],
    ), 200


@app.post("/api/hubs/<path:hub>/kiloslitros")
@jwt_required()
def kilos_litros_add(hub):
    data = request.get_json(silent=True) or {}

    hub_row = get_or_create_hub(hub)

    day = str(data.get("day") or "").strip()
    nombre = str(data.get("nombre") or "").strip()

    try:
        ruta_numero = int(data.get("ruta_numero"))
    except Exception:
        return jsonify(error="ruta_numero es obligatorio y numérico"), 400

    clientes = int(data.get("clientes") or 0)
    kilos = float(data.get("kilos") or 0)
    litros = float(data.get("litros") or 0)

    if not day:
        return jsonify(error="day es obligatorio (YYYY-MM-DD)"), 400

    try:
        dt = datetime.strptime(day, "%Y-%m-%d")
    except Exception:
        return jsonify(error="Formato de day inválido. Use YYYY-MM-DD"), 400

    year = dt.year
    month = dt.month

    if ruta_numero <= 0:
        return jsonify(error="Número de ruta inválido"), 400
    if clientes < 0 or kilos < 0 or litros < 0:
        return jsonify(error="Valores negativos no permitidos"), 400
    if not nombre:
        return jsonify(error="nombre es obligatorio"), 400

    exists = KilosLitros.query.filter_by(
        hub_id=hub_row.id,
        day=day,
        ruta_numero=ruta_numero,
        active=True,
    ).first()

    if exists:
        return jsonify(error="Ya existe un registro para esa ruta en ese día"), 409

    item = KilosLitros(
        hub_id=hub_row.id,
        day=day,
        year=year,
        month=month,
        ruta_numero=ruta_numero,
        nombre=nombre,
        clientes=clientes,
        kilos=kilos,
        litros=litros,
        active=True,
    )

    db.session.add(item)
    db.session.commit()

    return jsonify(
        item={
            "id": item.id,
            "day": item.day,
            "year": item.year,
            "month": item.month,
            "ruta_numero": item.ruta_numero,
            "nombre": item.nombre,
            "clientes": item.clientes,
            "kilos": item.kilos,
            "litros": item.litros,
        }
    ), 201

@app.route("/api/hubs/<hub>/kiloslitros/<int:item_id>", methods=["PUT"])
@jwt_required()
def kilos_litros_update(hub, item_id):
    data = request.get_json(silent=True) or {}

    ruta_numero = data.get("ruta_numero")
    nombre = data.get("nombre")
    clientes = data.get("clientes")
    kilos = data.get("kilos")
    litros = data.get("litros")

    # -------------------------
    # Validaciones
    # -------------------------
    try:
        ruta_numero = int(ruta_numero)
        if ruta_numero <= 0:
            raise ValueError()
    except Exception:
        return jsonify({"error": "ruta_numero inválido"}), 400

    nombre = str(nombre or "").strip().lower()
    if not nombre:
        return jsonify({"error": "nombre es obligatorio"}), 400

    try:
        clientes = int(clientes)
        if clientes < 0:
            raise ValueError()
    except Exception:
        return jsonify({"error": "clientes inválido"}), 400

    def _to_float(v):
        s = str(v or "").strip().replace(",", ".")
        if s == "":
            return 0.0
        return float(s)

    try:
        kilos = _to_float(kilos)
        litros = _to_float(litros)
        if kilos < 0 or litros < 0:
            raise ValueError()
    except Exception:
        return jsonify({"error": "kilos/litros inválido"}), 400

    if kilos == 0 and litros == 0:
        return jsonify({"error": "Debe indicar kilos o litros"}), 400

    # -------------------------
    # Hub + Item
    # -------------------------
    hub_row = get_or_create_hub(hub)  # 🔥 consistente con list/add

    item = KilosLitros.query.filter_by(id=item_id).first()  # ✅ sin active=True
    if not item:
        return jsonify({"error": "Registro no encontrado"}), 404

    if item.hub_id != hub_row.id:
        return jsonify({"error": "Registro no pertenece a ese HUB"}), 404

    if not item.active:
        return jsonify({"error": "Registro eliminado (no se puede editar)"}), 409

    # evitar choque unique (hub_id, day, ruta_numero, active)
    dup = KilosLitros.query.filter_by(
        hub_id=hub_row.id,
        day=item.day,
        ruta_numero=ruta_numero,
        active=True
    ).filter(KilosLitros.id != item.id).first()

    if dup:
        return jsonify({"error": "Ya existe un registro ACTIVO para ese día y esa ruta"}), 409

    # -------------------------
    # Update
    # -------------------------
    item.ruta_numero = ruta_numero
    item.nombre = nombre
    item.clientes = clientes
    item.kilos = kilos
    item.litros = litros

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "Error de integridad al actualizar"}), 409
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Error al actualizar"}), 500

    return jsonify(item={
        "id": item.id,
        "day": item.day,
        "year": item.year,
        "month": item.month,
        "ruta_numero": item.ruta_numero,
        "nombre": item.nombre,
        "clientes": item.clientes,
        "kilos": item.kilos,
        "litros": item.litros,
    }), 200



@app.route("/api/hubs/<hub>/kiloslitros/<int:item_id>", methods=["DELETE"])
@jwt_required()
def kilos_litros_delete(hub, item_id):
    hub_row = get_or_create_hub(hub)  # 🔥 usá el mismo helper que en list/add

    # ✅ buscar por id SIN active=True
    item = KilosLitros.query.filter_by(id=item_id).first()
    if not item:
        return jsonify({"error": "Registro no encontrado"}), 404

    if item.hub_id != hub_row.id:
        return jsonify({"error": "Registro no pertenece a ese HUB"}), 404

    # ✅ si ya está borrado (inactive), avisar claro
    if not item.active:
        return jsonify({"error": "Registro ya estaba eliminado"}), 409

    try:
        db.session.delete(item)  # delete real (evita UNIQUE con active=0)
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Error al eliminar"}), 500

    return jsonify({"ok": True}), 200


# ----------------------------------------------------------------------------------------
# Compras
# ----------------------------------------------------------------------------------------

def _to_float(v, default=0.0):
    if v is None:
        return default
    s = str(v).strip().replace(",", ".")
    if s == "":
        return default
    return float(s)

def _to_int(v, default=1):
    if v is None:
        return default
    s = str(v).strip()
    if s == "":
        return default
    return int(float(s))

def _compra_to_dict(i: HubCompra):
    precio = float(i.precio or 0.0)
    cantidad = int(i.cantidad or 1)

    espec = (i.especificaciones or "").strip()

    return {
        "id": i.id,
        "item": i.item,

        # NUEVO: manda ambos para que el frontend viejo funcione
        "especificaciones": espec,
        "descripcion": espec,

        "donde": i.donde,
        "precio": precio,
        "cantidad": cantidad,
        "total": precio * cantidad,
        "comprado": bool(i.comprado),
        "active": bool(i.active),
        "created_at": i.created_at.isoformat() if i.created_at else None,
        "updated_at": i.updated_at.isoformat() if i.updated_at else None,
    }

@app.get("/api/hubs/<path:hub>/compras")
@jwt_required()
def compras_list(hub):
    hub_row = get_or_create_hub(hub)

    q = HubCompra.query.filter_by(hub_id=hub_row.id, active=True).order_by(HubCompra.created_at.desc())
    items = q.all()

    return jsonify(
        hub=hub_row.name,
        items=[_compra_to_dict(i) for i in items],
    ), 200


@app.post("/api/hubs/<path:hub>/compras")
@jwt_required()
def compras_add(hub):
    hub_row = get_or_create_hub(hub)
    data = request.get_json(silent=True) or {}

    item = str(data.get("item") or "").strip()
    if not item:
        return jsonify(error="item es obligatorio"), 400

    # acepta descripcion o especificaciones
    espec = str(data.get("especificaciones") or data.get("descripcion") or "").strip()
    donde = str(data.get("donde") or "").strip()

    try:
        precio = _to_float(data.get("precio"), default=0.0)
        cantidad = _to_int(data.get("cantidad"), default=1)
    except Exception:
        return jsonify(error="precio/cantidad inválidos"), 400

    if precio < 0:
        return jsonify(error="precio inválido"), 400
    if cantidad <= 0:
        return jsonify(error="cantidad inválida"), 400

    row = HubCompra(
        hub_id=hub_row.id,
        item=item,
        especificaciones=espec,
        donde=donde,
        precio=precio,
        cantidad=cantidad,
        comprado=False,
        active=True,
    )

    db.session.add(row)
    db.session.commit()

    return jsonify(item=_compra_to_dict(row)), 201


@app.put("/api/hubs/<path:hub>/compras/<int:item_id>")
@jwt_required()
def compras_update(hub, item_id):
    hub_row = get_or_create_hub(hub)
    data = request.get_json(silent=True) or {}

    row = HubCompra.query.filter_by(id=item_id, hub_id=hub_row.id, active=True).first()
    if not row:
        return jsonify(error="Registro no encontrado"), 404

    # PATCH: solo cambia lo que venga
    if "item" in data:
        v = str(data.get("item") or "").strip()
        if not v:
            return jsonify(error="item es obligatorio"), 400
        row.item = v

    if "especificaciones" in data or "descripcion" in data:
        row.especificaciones = str(data.get("especificaciones") or data.get("descripcion") or "").strip()

    if "donde" in data:
        row.donde = str(data.get("donde") or "").strip()

    if "precio" in data:
        try:
            p = _to_float(data.get("precio"), default=0.0)
        except Exception:
            return jsonify(error="precio inválido"), 400
        if p < 0:
            return jsonify(error="precio inválido"), 400
        row.precio = p

    if "cantidad" in data:
        try:
            c = _to_int(data.get("cantidad"), default=1)
        except Exception:
            return jsonify(error="cantidad inválida"), 400
        if c <= 0:
            return jsonify(error="cantidad inválida"), 400
        row.cantidad = c

    if "comprado" in data:
        row.comprado = bool(data.get("comprado"))

    db.session.commit()
    return jsonify(item=_compra_to_dict(row)), 200


@app.delete("/api/hubs/<path:hub>/compras/<int:item_id>")
@jwt_required()
def compras_delete(hub, item_id):
    hub_row = get_or_create_hub(hub)

    row = HubCompra.query.filter_by(id=item_id, hub_id=hub_row.id, active=True).first()
    if not row:
        return jsonify(error="Registro no encontrado"), 404

    # hard delete (más simple en sqlite)
    db.session.delete(row)
    db.session.commit()
    return jsonify(ok=True), 200

# ----------------------------------------------------------------------------------------
# Historico de incidencias (Flota)
# ----------------------------------------------------------------------------------------

from datetime import datetime
from flask import request, jsonify
from flask_jwt_extended import jwt_required

# ✅ Acepta DD/MM/YYYY (España) y YYYY-MM-DD (input type="date")
def parse_fecha_es(v):
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None

    for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None


def _incidencia_to_dict(x):
    return {
        "id": x.id,
        "vehiculo_id": x.vehiculo_id,
        "titulo": x.titulo,
        "descripcion": x.descripcion,
        "coste": float(x.coste or 0.0),
        "km": int(x.km or 0),
        # ✅ devolvemos en formato España:
        "fecha": x.fecha.strftime("%d/%m/%Y") if x.fecha else None,
        "created_at": x.created_at.isoformat() if x.created_at else None,
        "updated_at": x.updated_at.isoformat() if x.updated_at else None,
    }


@app.get("/api/hubs/<path:hub>/flota/<int:vehiculo_id>/incidencias")
@jwt_required()
def flota_incidencias_list(hub, vehiculo_id):
    hub_row = get_or_create_hub(hub)

    veh = FlotaVehiculo.query.filter_by(id=vehiculo_id, hub_id=hub_row.id, active=True).first()
    if not veh:
        return jsonify(error="Vehículo no encontrado"), 404

    items = (
        FlotaIncidencia.query
        .filter_by(hub_id=hub_row.id, vehiculo_id=vehiculo_id)
        .order_by(FlotaIncidencia.fecha.desc(), FlotaIncidencia.id.desc())
        .all()
    )

    return jsonify(
        vehiculo={
            "id": veh.id,
            "matricula": veh.matricula,
            "tipo": veh.tipo,
        },
        # ✅ usa el helper (fecha DD/MM/YYYY)
        items=[_incidencia_to_dict(x) for x in items],
    ), 200


@app.post("/api/hubs/<path:hub>/flota/<int:vehiculo_id>/incidencias")
@jwt_required()
def flota_incidencias_add(hub, vehiculo_id):
    hub_row = get_or_create_hub(hub)
    data = request.get_json(silent=True) or {}

    # valida vehículo
    veh = FlotaVehiculo.query.filter_by(id=vehiculo_id, hub_id=hub_row.id, active=True).first()
    if not veh:
        return jsonify(error="Vehículo no encontrado"), 404

    titulo = str(data.get("titulo") or "").strip()
    if not titulo:
        return jsonify(error="Título obligatorio"), 400

    fecha = parse_fecha_es(data.get("fecha"))
    if not fecha:
        return jsonify(error="fecha inválida (usa DD/MM/AAAA)"), 400

    descripcion = str(data.get("descripcion") or "").strip()

    # coste tolerante con coma
    try:
        coste = float(str(data.get("coste") or "0").strip().replace(",", "."))
    except Exception:
        return jsonify(error="coste inválido"), 400
    if coste < 0:
        return jsonify(error="coste inválido"), 400

    # km tolerante (permite "2000" o "2000.0")
    try:
        km = int(float(str(data.get("km") or "0").strip()))
    except Exception:
        return jsonify(error="km inválido"), 400
    if km < 0:
        return jsonify(error="km inválido"), 400

    row = FlotaIncidencia(
        hub_id=hub_row.id,
        vehiculo_id=vehiculo_id,
        titulo=titulo,
        descripcion=descripcion,
        coste=coste,
        km=km,
        fecha=fecha,
    )

    db.session.add(row)
    db.session.commit()

    return jsonify(item=_incidencia_to_dict(row)), 201


@app.put("/api/hubs/<path:hub>/flota/<int:vehiculo_id>/incidencias/<int:inc_id>")
@jwt_required()
def flota_incidencias_update(hub, vehiculo_id, inc_id):
    hub_row = get_or_create_hub(hub)
    data = request.get_json(silent=True) or {}

    row = FlotaIncidencia.query.filter_by(
        id=inc_id,
        hub_id=hub_row.id,
        vehiculo_id=vehiculo_id
    ).first()

    if not row:
        return jsonify(error="Incidencia no encontrada"), 404

    # PATCH: solo cambia lo que venga
    if "titulo" in data:
        t = str(data.get("titulo") or "").strip()
        if not t:
            return jsonify(error="Título obligatorio"), 400
        row.titulo = t

    if "descripcion" in data:
        row.descripcion = str(data.get("descripcion") or "").strip()

    if "coste" in data:
        try:
            c = float(str(data.get("coste") or "0").strip().replace(",", "."))
        except Exception:
            return jsonify(error="coste inválido"), 400
        if c < 0:
            return jsonify(error="coste inválido"), 400
        row.coste = c

    if "km" in data:
        try:
            k = int(float(str(data.get("km") or "0").strip()))
        except Exception:
            return jsonify(error="km inválido"), 400
        if k < 0:
            return jsonify(error="km inválido"), 400
        row.km = k

    if "fecha" in data:
        f = parse_fecha_es(data.get("fecha"))
        if not f:
            return jsonify(error="fecha inválida (usa DD/MM/AAAA)"), 400
        row.fecha = f

    db.session.commit()
    return jsonify(item=_incidencia_to_dict(row)), 200


@app.delete("/api/hubs/<path:hub>/flota/<int:vehiculo_id>/incidencias/<int:inc_id>")
@jwt_required()
def flota_incidencias_delete(hub, vehiculo_id, inc_id):
    hub_row = get_or_create_hub(hub)

    row = FlotaIncidencia.query.filter_by(
        id=inc_id,
        hub_id=hub_row.id,
        vehiculo_id=vehiculo_id
    ).first()

    if not row:
        return jsonify(error="Incidencia no encontrada"), 404

    db.session.delete(row)
    db.session.commit()
    return jsonify(ok=True), 200


# ----------------------------------------------------------------------------------------
# Contactos (por plaza / HUB)
# ----------------------------------------------------------------------------------------

def _norm_str(v, max_len=None):
    s = str(v or "").strip()
    if max_len:
        s = s[:max_len]
    return s

def _norm_phone(v):
    # deja + y dígitos, quita espacios/guiones
    s = _norm_str(v, 40)
    s = s.replace(" ", "").replace("-", "")
    return s

def _contacto_to_dict(x):
    return {
        "id": x.id,
        "nombre": x.nombre,
        "cargo": x.cargo,
        "telefono": x.telefono,
        "active": bool(x.active),
        "created_at": x.created_at.isoformat() if x.created_at else None,
        "updated_at": x.updated_at.isoformat() if x.updated_at else None,
    }

@app.get("/api/hubs/<path:hub>/contactos")
@jwt_required()
def contactos_list(hub):
    hub_row = get_or_create_hub(hub)

    q = Contacto.query.filter_by(hub_id=hub_row.id, active=True) \
        .order_by(Contacto.nombre.asc(), Contacto.id.desc())

    items = q.all()
    return jsonify(
        hub=hub_row.name,
        items=[_contacto_to_dict(x) for x in items],
    ), 200


@app.post("/api/hubs/<path:hub>/contactos")
@jwt_required()
def contactos_add(hub):
    hub_row = get_or_create_hub(hub)
    data = request.get_json(silent=True) or {}

    nombre = _norm_str(data.get("nombre"), 200)
    cargo = _norm_str(data.get("cargo"), 120)
    telefono = _norm_phone(data.get("telefono"))

    if not nombre:
        return jsonify(error="nombre es obligatorio"), 400
    if not telefono:
        return jsonify(error="telefono es obligatorio"), 400

    # evita duplicado por HUB (también lo cubre el UNIQUE)
    exists = Contacto.query.filter_by(hub_id=hub_row.id, telefono=telefono, active=True).first()
    if exists:
        return jsonify(error="Ya existe un contacto con ese teléfono en esta plaza"), 409

    row = Contacto(
        hub_id=hub_row.id,
        nombre=nombre,
        cargo=cargo,
        telefono=telefono,
        active=True,
    )
    db.session.add(row)
    db.session.commit()

    return jsonify(item=_contacto_to_dict(row)), 201


@app.put("/api/hubs/<path:hub>/contactos/<int:contacto_id>")
@jwt_required()
def contactos_update(hub, contacto_id):
    hub_row = get_or_create_hub(hub)
    data = request.get_json(silent=True) or {}

    row = Contacto.query.filter_by(id=contacto_id, hub_id=hub_row.id, active=True).first()
    if not row:
        return jsonify(error="Contacto no encontrado"), 404

    if "nombre" in data:
        nombre = _norm_str(data.get("nombre"), 200)
        if not nombre:
            return jsonify(error="nombre es obligatorio"), 400
        row.nombre = nombre

    if "cargo" in data:
        row.cargo = _norm_str(data.get("cargo"), 120)

    if "telefono" in data:
        tel = _norm_phone(data.get("telefono"))
        if not tel:
            return jsonify(error="telefono es obligatorio"), 400

        # check duplicado en el mismo hub con otro id
        dup = Contacto.query.filter(
            Contacto.hub_id == hub_row.id,
            Contacto.telefono == tel,
            Contacto.active == True,
            Contacto.id != row.id,
        ).first()
        if dup:
            return jsonify(error="Ya existe un contacto con ese teléfono en esta plaza"), 409

        row.telefono = tel

    db.session.commit()
    return jsonify(item=_contacto_to_dict(row)), 200


@app.delete("/api/hubs/<path:hub>/contactos/<int:contacto_id>")
@jwt_required()
def contactos_delete(hub, contacto_id):
    hub_row = get_or_create_hub(hub)

    row = Contacto.query.filter_by(id=contacto_id, hub_id=hub_row.id, active=True).first()
    if not row:
        return jsonify(error="Contacto no encontrado"), 404

    # soft delete (mejor que borrar en sqlite)
    row.active = False
    db.session.commit()
    return jsonify(ok=True), 200


# ----------------------------------------------------------------------------------------
# Reparto (por plaza / HUB) - rutas desde Liquidaciones + clientes por ruta
# ----------------------------------------------------------------------------------------

from flask import request, jsonify
from flask_jwt_extended import jwt_required

# ========= Helpers =========

def _to_float(v, default=0.0):
    try:
        s = str(v).strip().replace(",", ".")
        if s == "":
            return default
        return float(s)
    except Exception:
        return default

def _to_int(v, default=0):
    try:
        s = str(v).strip()
        if s == "":
            return default
        return int(float(s))
    except Exception:
        return default

def reparto_cliente_to_dict(x):
    return {
        "id": x.id,
        "hub_id": x.hub_id,
        "route_id": x.route_id,
        "cliente_codigo": x.cliente_codigo,
        "nombre": x.nombre,
        "direccion": x.direccion,
        "lat": float(x.lat or 0.0),
        "lng": float(x.lng or 0.0),
        "estado": getattr(x, "estado", None),  # por si tu tabla vieja no lo tiene aún
        "activo": bool(getattr(x, "activo", True)),
        "created_at": x.created_at.isoformat() if getattr(x, "created_at", None) else None,
        "updated_at": x.updated_at.isoformat() if getattr(x, "updated_at", None) else None,
    }

def _ensure_cliente_codigo(row):
    if not (row.cliente_codigo or "").strip():
        row.cliente_codigo = f"MANUAL-{row.id}"


# ----------------------------------------------------------------------------------------
# GET CLIENTES REPARTO (filtrado por route_id)
# ----------------------------------------------------------------------------------------

@app.get("/api/hubs/<path:hub>/reparto/clientes", endpoint="reparto_clientes_list_v1")
@jwt_required()
def reparto_clientes_list(hub):
    hub_row = get_or_create_hub(hub)

    route_id = request.args.get("route_id", type=int)
    if not route_id:
        return jsonify(items=[]), 200

    q = (
        RepartoCliente.query
        .filter_by(hub_id=hub_row.id, route_id=route_id)
        .order_by(RepartoCliente.nombre.asc())
    )

    # ✅ si la DB tiene columna activo, filtramos; si no, no rompemos
    try:
        q = q.filter(RepartoCliente.activo == True)  # noqa: E712
    except Exception:
        pass

    rows = q.all()
    return jsonify(items=[reparto_cliente_to_dict(x) for x in rows]), 200


# ----------------------------------------------------------------------------------------
# POST CLIENTE REPARTO
# Body:
# { route_id, nombre, direccion, lat, lng, estado? , cliente_codigo? }
# cliente_codigo opcional: si no viene -> MANUAL-<id>
# ----------------------------------------------------------------------------------------

@app.post("/api/hubs/<path:hub>/reparto/clientes", endpoint="reparto_clientes_add_v1")
@jwt_required()
def reparto_clientes_add(hub):
    hub_row = get_or_create_hub(hub)
    data = request.get_json(silent=True) or {}

    route_id = _to_int(data.get("route_id"), default=0)
    if route_id <= 0:
        return jsonify(error="route_id obligatorio"), 400

    # valida que exista la ruta y sea del HUB
    # OJO: tu modelo LiquidacionRuta puede tener active o activo. Lo detectamos:
    q = LiquidacionRuta.query.filter_by(id=route_id, hub_id=hub_row.id)
    if hasattr(LiquidacionRuta, "active"):
        q = q.filter(LiquidacionRuta.active == True)
    elif hasattr(LiquidacionRuta, "activo"):
        q = q.filter(LiquidacionRuta.activo == True)
    route = q.first()

    if not route:
        return jsonify(error="route_id no existe en Liquidaciones para este HUB"), 400

    nombre = str(data.get("nombre") or "").strip()
    if not nombre:
        return jsonify(error="Nombre obligatorio"), 400

    direccion = str(data.get("direccion") or "").strip()
    if not direccion:
        return jsonify(error="Dirección obligatoria"), 400

    # ✅ lat/lng ya NO son obligatorios
    lat_in = data.get("lat", None)
    lng_in = data.get("lng", None)

    lat = None
    lng = None

    # si vienen, los usamos
    if lat_in is not None and lng_in is not None:
        lat = _to_float(lat_in, default=0.0)
        lng = _to_float(lng_in, default=0.0)

    # si no vienen o vienen inválidos -> geocoding
    if lat is None or lng is None or (lat == 0.0 and lng == 0.0):
        lat_g, lng_g = _geocode_nominatim(direccion, hub_hint=hub)
        if lat_g is None or lng_g is None:
            return jsonify(error="No pude ubicar la dirección. Prueba con una dirección más exacta o añade lat/lng."), 400
        lat, lng = lat_g, lng_g

    estado = str(data.get("estado") or "pendiente").lower().strip()
    if estado not in ("pendiente", "entregado", "anulado", "cambiado_dia"):
        return jsonify(error="Estado inválido"), 400

    cliente_codigo = str(data.get("cliente_codigo") or "").strip()  # opcional

    row = RepartoCliente(
        hub_id=hub_row.id,
        route_id=route_id,
        cliente_codigo=cliente_codigo or "",
        nombre=nombre,
        direccion=direccion,
        lat=lat,
        lng=lng,
        activo=True,
    )

    # si tu tabla tiene 'estado', se lo seteamos
    if hasattr(RepartoCliente, "estado"):
        row.estado = estado

    db.session.add(row)
    db.session.commit()

    _ensure_cliente_codigo(row)
    db.session.commit()

    return jsonify(item=reparto_cliente_to_dict(row)), 201



# ----------------------------------------------------------------------------------------
# PUT CLIENTE REPARTO (update parcial)
# Body puede traer:
# { estado, nombre, direccion, lat, lng, route_id, cliente_codigo, activo }
# ----------------------------------------------------------------------------------------

@app.put("/api/hubs/<path:hub>/reparto/clientes/<int:cid>", endpoint="reparto_clientes_update_v1")
@jwt_required()
def reparto_clientes_update(hub, cid):
    hub_row = get_or_create_hub(hub)
    data = request.get_json(silent=True) or {}

    row = RepartoCliente.query.filter_by(id=cid, hub_id=hub_row.id).first()
    if not row:
        return jsonify(error="Cliente no encontrado"), 404

    if "estado" in data and hasattr(row, "estado"):
        estado = str(data.get("estado") or "").lower().strip()
        if estado not in ("pendiente", "entregado", "anulado", "cambiado_dia"):
            return jsonify(error="Estado inválido"), 400
        row.estado = estado

    if "nombre" in data:
        n = str(data.get("nombre") or "").strip()
        if not n:
            return jsonify(error="Nombre no puede estar vacío"), 400
        row.nombre = n

    if "direccion" in data:
        row.direccion = str(data.get("direccion") or "").strip()

    if "lat" in data:
        row.lat = _to_float(data.get("lat"), default=row.lat)

    if "lng" in data:
        row.lng = _to_float(data.get("lng"), default=row.lng)

    if "cliente_codigo" in data:
        cc = str(data.get("cliente_codigo") or "").strip()
        row.cliente_codigo = cc

    if "route_id" in data:
        rid = _to_int(data.get("route_id"), default=0)
        if rid <= 0:
            return jsonify(error="route_id inválido"), 400
        route = LiquidacionRuta.query.filter_by(id=rid, hub_id=hub_row.id, active=True).first()
        if not route:
            return jsonify(error="route_id no existe en Liquidaciones para este HUB"), 400
        row.route_id = rid

    if "activo" in data and hasattr(row, "activo"):
        row.activo = bool(data.get("activo"))

    db.session.commit()
    _ensure_cliente_codigo(row)
    db.session.commit()

    return jsonify(item=reparto_cliente_to_dict(row)), 200


# ----------------------------------------------------------------------------------------
# DELETE CLIENTE REPARTO (soft delete)
# ----------------------------------------------------------------------------------------

@app.delete("/api/hubs/<path:hub>/reparto/clientes/<int:cid>", endpoint="reparto_clientes_delete_v1")
@jwt_required()
def reparto_clientes_delete(hub, cid):
    hub_row = get_or_create_hub(hub)

    row = RepartoCliente.query.filter_by(id=cid, hub_id=hub_row.id).first()
    if not row:
        return jsonify(error="Cliente no encontrado"), 404

    # si existe activo -> soft delete; si no, hard delete
    if hasattr(row, "activo"):
        row.activo = False
        db.session.commit()
        return jsonify(ok=True), 200

    db.session.delete(row)
    db.session.commit()
    return jsonify(ok=True), 200


# ----------------------------------------------------------------------------------------
# GET MOTOS (stub por ahora)
# ----------------------------------------------------------------------------------------

@app.get("/api/hubs/<path:hub>/reparto/motos")
def reparto_motos_stub(hub):
    _ = get_or_create_hub(hub)
    return jsonify(items=[]), 200



def _geocode_nominatim(direccion: str, hub_hint: str = ""):
    """
    Geocoding básico usando Nominatim (OpenStreetMap).
    Devuelve (lat, lng) o (None, None) si no encuentra.

    OJO: Nominatim requiere User-Agent.
    """
    q = (direccion or "").strip()
    if not q:
        return None, None

    # pequeña ayuda: añade España si no lo pone
    # y mete un hint del hub (ej: "Córdoba", "Madrid") si quieres
    query = q
    if "españa" not in query.lower():
        query = f"{query}, España"

    url = "https://nominatim.openstreetmap.org/search"
    params = {
        "q": query,
        "format": "json",
        "limit": 1,
    }

    try:
        r = requests.get(
            url,
            params=params,
            headers={"User-Agent": "AreaTrans/1.0 (contact: soporte@areatrans.local)"},
            timeout=12,
        )
        if r.status_code != 200:
            return None, None

        data = r.json() if r.text else []
        if not data:
            return None, None

        lat = _to_float(data[0].get("lat"), default=0.0)
        lng = _to_float(data[0].get("lon"), default=0.0)
        if lat == 0.0 and lng == 0.0:
            return None, None
        return lat, lng
    except Exception:
        return None, None




if __name__ == "__main__":
    app.run(debug=True, port=5000)


