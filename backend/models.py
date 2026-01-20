from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, date
from sqlalchemy import func

db = SQLAlchemy()


# ======================================================
# USUARIOS
# ======================================================

class User(db.Model):
    __tablename__ = "users"

    email = db.Column(db.String(200), primary_key=True)
    name = db.Column(db.String(200), nullable=False)  # Nombre + Apellido
    password_hash = db.Column(db.String(255), nullable=False)

    role = db.Column(db.String(20), nullable=False, default="user")  # user | admin
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    created_at = db.Column(
        db.DateTime, server_default=db.func.now(), nullable=False
    )

    def __repr__(self):
        return f"<User {self.email} ({self.role})>"


# ======================================================
# HUBS
# ======================================================

class Hub(db.Model):
    __tablename__ = "hubs"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), unique=True, nullable=False)

    created_at = db.Column(
        db.DateTime, server_default=db.func.now(), nullable=False
    )

    def __repr__(self):
        return f"<Hub {self.name}>"


# ======================================================
# EMPLEADOS
# ======================================================

class Employee(db.Model):
    __tablename__ = "employees"

    id = db.Column(db.Integer, primary_key=True)
    hub_id = db.Column(db.Integer, db.ForeignKey("hubs.id"), nullable=False)
    name = db.Column(db.String(200), nullable=False)
    active = db.Column(db.Boolean, nullable=False, default=True)

    created_at = db.Column(
        db.DateTime, server_default=db.func.now(), nullable=False
    )

    hub = db.relationship("Hub", backref=db.backref("employees", lazy=True))

    __table_args__ = (
        db.UniqueConstraint("hub_id", "name", name="uq_employee_hub_name"),
    )

    def __repr__(self):
        return f"<Employee {self.name} (Hub {self.hub_id})>"


# ======================================================
# ASISTENCIAS
# ======================================================

class Attendance(db.Model):
    """
    Una fila por empleado y fecha.
    code: "", 1, F, D, V, E, L, O, M, C
    """
    __tablename__ = "attendance"

    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False)

    day = db.Column(db.String(10), nullable=False)  # YYYY-MM-DD
    code = db.Column(db.String(5), nullable=False, default="")

    created_at = db.Column(
        db.DateTime, server_default=db.func.now(), nullable=False
    )
    updated_at = db.Column(
        db.DateTime,
        server_default=db.func.now(),
        onupdate=db.func.now(),
        nullable=False,
    )

    employee = db.relationship(
        "Employee", backref=db.backref("attendance", lazy=True)
    )

    __table_args__ = (
        db.UniqueConstraint("employee_id", "day", name="uq_employee_day"),
    )

    def __repr__(self):
        return f"<Attendance emp={self.employee_id} day={self.day} code={self.code}>"


# ======================================================
# HORAS EXTRA
# ======================================================

class ExtraHours(db.Model):
    """
    Una fila por empleado y fecha.
    hours guardado como string para permitir coma decimal (0,5)
    """
    __tablename__ = "extra_hours"

    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False)

    day = db.Column(db.String(10), nullable=False)  # YYYY-MM-DD
    hours = db.Column(db.String(20), nullable=False, default="")  # "0,5"

    created_at = db.Column(
        db.DateTime, server_default=db.func.now(), nullable=False
    )
    updated_at = db.Column(
        db.DateTime,
        server_default=db.func.now(),
        onupdate=db.func.now(),
        nullable=False,
    )

    employee = db.relationship(
        "Employee", backref=db.backref("extra_hours", lazy=True)
    )

    __table_args__ = (
        db.UniqueConstraint("employee_id", "day", name="uq_employee_day_he"),
    )

    def __repr__(self):
        return f"<ExtraHours emp={self.employee_id} day={self.day} hours={self.hours}>"


# ======================================================
# COMENTARIOS ASISTENCIAS (INICIO / FIN)
# ======================================================

class AsistenciasComment(db.Model):
    """
    Comentarios por HUB y mes.
    month_key = "YYYY-MM"
    """
    __tablename__ = "asistencias_comments"

    id = db.Column(db.Integer, primary_key=True)
    hub_id = db.Column(db.Integer, db.ForeignKey("hubs.id"), nullable=False)

    month_key = db.Column(db.String(7), nullable=False)  # YYYY-MM

    comment_start = db.Column(db.Text, nullable=False, default="")
    comment_end = db.Column(db.Text, nullable=False, default="")

    created_at = db.Column(
        db.DateTime, server_default=db.func.now(), nullable=False
    )
    updated_at = db.Column(
        db.DateTime,
        server_default=db.func.now(),
        onupdate=db.func.now(),
        nullable=False,
    )

    hub = db.relationship(
        "Hub", backref=db.backref("asistencias_comments", lazy=True)
    )

    __table_args__ = (
        db.UniqueConstraint("hub_id", "month_key", name="uq_hub_month_comment"),
    )

    def __repr__(self):
        return f"<AsistenciasComment hub={self.hub_id} month={self.month_key}>"


# ======================================================
# COMENTARIOS Liquidaciones (INICIO / FIN)
# ======================================================

class LiquidacionRuta(db.Model):
    """
    Rutas de liquidación por HUB.
    Ej: Hub Cáceres -> 103, 143, 310...
    """
    __tablename__ = "liquidacion_rutas"

    id = db.Column(db.Integer, primary_key=True)
    hub_id = db.Column(db.Integer, db.ForeignKey("hubs.id"), nullable=False)
    code = db.Column(db.String(50), nullable=False)  # "103", "143", "RUTA 310", etc.
    active = db.Column(db.Boolean, nullable=False, default=True)

    created_at = db.Column(db.DateTime, server_default=db.func.now(), nullable=False)

    hub = db.relationship("Hub", backref=db.backref("liquidacion_rutas", lazy=True))

    __table_args__ = (
        db.UniqueConstraint("hub_id", "code", name="uq_hub_route_code"),
    )


class LiquidacionEntry(db.Model):
    """
    Una fila por (ruta, día).
    Guarda lo del Excel: repartidor, metalico, ingreso
    diferencia se calcula en frontend/back (no hace falta columna).
    """
    __tablename__ = "liquidacion_entries"

    id = db.Column(db.Integer, primary_key=True)
    route_id = db.Column(db.Integer, db.ForeignKey("liquidacion_rutas.id"), nullable=False)

    day = db.Column(db.String(10), nullable=False)  # "YYYY-MM-DD"
    repartidor = db.Column(db.String(200), nullable=False, default="")

    # guardamos como string para permitir coma "1.268,05"
    metalico = db.Column(db.String(50), nullable=False, default="")
    ingreso = db.Column(db.String(50), nullable=False, default="")

    # ✅ NUEVO: comentario por día (opcional)
    comment = db.Column(db.String(500), nullable=False, default="")

    created_at = db.Column(db.DateTime, server_default=db.func.now(), nullable=False)
    updated_at = db.Column(
        db.DateTime, server_default=db.func.now(), onupdate=db.func.now(), nullable=False
    )

    route = db.relationship("LiquidacionRuta", backref=db.backref("entries", lazy=True))

    __table_args__ = (
        db.UniqueConstraint("route_id", "day", name="uq_route_day"),
    )

# ======================================================
# COMENTARIOS FLOTA (INICIO / FIN)
# ======================================================

class FlotaVehiculo(db.Model):
    __tablename__ = "flota_vehiculos"

    id = db.Column(db.Integer, primary_key=True)
    hub_id = db.Column(db.Integer, db.ForeignKey("hubs.id"), nullable=False)

    matricula = db.Column(db.String(30), nullable=False)
    tipo = db.Column(db.String(30), nullable=False)

    active = db.Column(db.Boolean, nullable=False, default=True)

    created_at = db.Column(db.DateTime, server_default=db.func.now(), nullable=False)
    updated_at = db.Column(db.DateTime, server_default=db.func.now(), onupdate=db.func.now(), nullable=False)

    hub = db.relationship("Hub", backref=db.backref("flota_vehiculos", lazy=True))

    __table_args__ = (
        db.UniqueConstraint("hub_id", "matricula", name="uq_hub_matricula"),
    )


# ======================================================
# COMENTARIOS Kilos/Litros (INICIO / FIN)
# ======================================================

class KilosLitros(db.Model):
    __tablename__ = "kilos_litros"

    id = db.Column(db.Integer, primary_key=True)

    hub_id = db.Column(db.Integer, db.ForeignKey("hubs.id"), nullable=False)

    # ✅ fecha completa + filtro mes/año
    day = db.Column(db.String(10), nullable=False)  # "YYYY-MM-DD"
    year = db.Column(db.Integer, nullable=False)
    month = db.Column(db.Integer, nullable=False)

    ruta_numero = db.Column(db.Integer, nullable=False)

    # ✅ quién lleva la ruta
    nombre = db.Column(db.String(120), nullable=False, default="")

    clientes = db.Column(db.Integer, nullable=False, default=0)
    kilos = db.Column(db.Float, nullable=False, default=0)
    litros = db.Column(db.Float, nullable=False, default=0)

    active = db.Column(db.Boolean, nullable=False, default=True)

    created_at = db.Column(db.DateTime, server_default=func.now(), nullable=False)
    updated_at = db.Column(db.DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    hub = db.relationship("Hub", backref=db.backref("kilos_litros", lazy=True))

    __table_args__ = (
        # ✅ Un registro por HUB + día + ruta (activo)
        db.UniqueConstraint("hub_id", "day", "ruta_numero", "active", name="uq_hub_day_ruta_kilos"),
    )


# ----------------------------------------------------------------------------------------
# Compras
# ----------------------------------------------------------------------------------------

class HubCompra(db.Model):
    __tablename__ = "hub_compras"

    id = db.Column(db.Integer, primary_key=True)
    hub_id = db.Column(db.Integer, db.ForeignKey("hubs.id"), nullable=False)

    item = db.Column(db.String(200), nullable=False, default="")
    especificaciones = db.Column(db.String(500), nullable=False, default="")  # antes "descripcion"
    donde = db.Column(db.String(200), nullable=False, default="")

    # precio unitario (si viene vacío -> 0.0)
    precio = db.Column(db.Float, nullable=False, default=0.0)

    # cantidad (si viene vacío -> 1)
    cantidad = db.Column(db.Integer, nullable=False, default=1)

    comprado = db.Column(db.Boolean, nullable=False, default=False)
    active = db.Column(db.Boolean, nullable=False, default=True)

    created_at = db.Column(db.DateTime, server_default=func.now(), nullable=False)
    updated_at = db.Column(db.DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    hub = db.relationship("Hub", backref=db.backref("compras", lazy=True))

# ----------------------------------------------------------------------------------------
# Incidencias Flota
# ----------------------------------------------------------------------------------------

class FlotaIncidencia(db.Model):
    __tablename__ = "flota_incidencias"

    id = db.Column(db.Integer, primary_key=True)
    hub_id = db.Column(db.Integer, db.ForeignKey("hubs.id"), nullable=False)
    vehiculo_id = db.Column(db.Integer, db.ForeignKey("flota_vehiculos.id"), nullable=False)

    titulo = db.Column(db.String(200), nullable=False, default="")
    descripcion = db.Column(db.String(1000), nullable=False, default="")
    coste = db.Column(db.Float, nullable=False, default=0.0)
    km = db.Column(db.Integer, nullable=False, default=0)
    fecha = db.Column(db.Date, nullable=False)

    created_at = db.Column(db.DateTime, server_default=func.now(), nullable=False)
    updated_at = db.Column(db.DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    hub = db.relationship("Hub", backref=db.backref("flota_incidencias", lazy=True))
    vehiculo = db.relationship("FlotaVehiculo", backref=db.backref("incidencias", lazy=True))

# ----------------------------------------------------------------------------------------
# Contactos (por plaza / HUB)
# ----------------------------------------------------------------------------------------

class Contacto(db.Model):
    __tablename__ = "hub_contactos"

    id = db.Column(db.Integer, primary_key=True)
    hub_id = db.Column(db.Integer, db.ForeignKey("hubs.id"), nullable=False)

    nombre = db.Column(db.String(200), nullable=False, default="")
    cargo = db.Column(db.String(120), nullable=False, default="")
    telefono = db.Column(db.String(40), nullable=False, default="")

    active = db.Column(db.Boolean, nullable=False, default=True)

    created_at = db.Column(db.DateTime, server_default=func.now(), nullable=False)
    updated_at = db.Column(db.DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    hub = db.relationship("Hub", backref=db.backref("contactos", lazy=True))

    __table_args__ = (
        # evita duplicar el mismo teléfono en el mismo HUB
        db.UniqueConstraint("hub_id", "telefono", name="uq_hub_telefono_contacto"),
    )


# ----------------------------------------------------------------------------------------
# Reparto (por plaza / HUB)
# ----------------------------------------------------------------------------------------

class RepartoCliente(db.Model):
    __tablename__ = "reparto_clientes"

    id = db.Column(db.Integer, primary_key=True)

    hub_id = db.Column(
        db.Integer,
        db.ForeignKey("hubs.id", name="fk_reparto_clientes_hub_id"),
        nullable=False
    )

    route_id = db.Column(
        db.Integer,
        db.ForeignKey("liquidacion_rutas.id", name="fk_reparto_clientes_route_id"),
        nullable=False
    )

    # si no existe, lo autogeneramos MANUAL-<id>
    cliente_codigo = db.Column(db.String(80), nullable=False, default="")

    nombre = db.Column(db.String(220), nullable=False, default="")
    direccion = db.Column(db.String(400), nullable=False, default="")
    

    lat = db.Column(db.Float, nullable=False, default=0.0)
    lng = db.Column(db.Float, nullable=False, default=0.0)

    estado = db.Column(db.String(20), nullable=False, default="pendiente")

    activo = db.Column(db.Boolean, nullable=False, default=True)

    created_at = db.Column(db.DateTime, server_default=func.now(), nullable=False)
    updated_at = db.Column(db.DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    hub = db.relationship("Hub", backref=db.backref("reparto_clientes", lazy=True))
    route = db.relationship("LiquidacionRuta", backref=db.backref("reparto_clientes", lazy=True))

    __table_args__ = (
        db.UniqueConstraint("hub_id", "route_id", "cliente_codigo", name="uq_reparto_hub_route_cliente"),
    )




class HeinekenPedido(db.Model):
    """
    Tabla espejo/sync: aquí guardas los pedidos que vienen de la DB de Heineken.
    Luego el mapa calcula el estado por cliente/ruta/fecha.
    """
    __tablename__ = "heineken_pedidos"

    id = db.Column(db.Integer, primary_key=True)

    hub_id = db.Column(db.Integer, db.ForeignKey("hubs.id"), nullable=False)

    pedido_codigo = db.Column(db.String(60), nullable=False, default="")  # opcional
    cliente_codigo = db.Column(db.String(60), nullable=False)
    ruta_code = db.Column(db.String(50), nullable=False)

    # fecha planificada/compromiso
    fecha = db.Column(db.Date, nullable=False)

    # status "PENDIENTE" | "SERVIDO" | "ANULADO"
    estado = db.Column(db.String(20), nullable=False, default="PENDIENTE")

    # si lo pasaron de día (reprogramado)
    reprogramado_a = db.Column(db.Date, nullable=True)

    created_at = db.Column(db.DateTime, server_default=func.now(), nullable=False)
    updated_at = db.Column(db.DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    hub = db.relationship("Hub", backref=db.backref("heineken_pedidos", lazy=True))

    __table_args__ = (
        db.Index("ix_pedido_hub_fecha_ruta_cliente", "hub_id", "fecha", "ruta_code", "cliente_codigo"),
    )


