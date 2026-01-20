"""fix reparto_clientes route_id

Revision ID: <PON_AQUI_EL_ID_QUE_TE_CREO_FLASK>
Revises: 293a48ed1218
Create Date: 2026-01-18

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text

# revision identifiers, used by Alembic.
revision = "<PON_AQUI_EL_ID_QUE_TE_CREO_FLASK>"
down_revision = "293a48ed1218"
branch_labels = None
depends_on = None


def _has_column(conn, table, col):
    rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
    return any(r[1] == col for r in rows)


def upgrade():
    conn = op.get_bind()

    # 1) Asegura columnas nuevas (solo si faltan)
    with op.batch_alter_table("reparto_clientes", schema=None) as batch_op:
        if not _has_column(conn, "reparto_clientes", "route_id"):
            batch_op.add_column(sa.Column("route_id", sa.Integer(), nullable=True))
        if not _has_column(conn, "reparto_clientes", "cliente_codigo"):
            batch_op.add_column(sa.Column("cliente_codigo", sa.String(length=80), nullable=False, server_default=""))

        # si tu tabla tenía ruta_code, la mantenemos por ahora para migrar datos (no la borres aún)

    # 2) Backfill route_id desde ruta_code (si existe ruta_code)
    has_ruta_code = _has_column(conn, "reparto_clientes", "ruta_code")
    if has_ruta_code:
        # route_id = LiquidacionRuta.id donde LiquidacionRuta.code == reparto_clientes.ruta_code y hub_id igual
        conn.execute(text("""
            UPDATE reparto_clientes
            SET route_id = (
                SELECT lr.id
                FROM liquidacion_rutas lr
                WHERE lr.hub_id = reparto_clientes.hub_id
                  AND lr.code = reparto_clientes.ruta_code
                LIMIT 1
            )
            WHERE route_id IS NULL
        """))

    # 3) Para filas que sigan sin route_id (ruta_code no matcheó),
    #    las mandamos a una ruta "SIN_RUTA" por HUB (la creamos si hace falta)
    #    (así no bloquea el NOT NULL)
    #    Nota: si prefieres fallar y arreglar manualmente, quita este bloque.
    # Crear ruta SIN_RUTA por cada hub_id presente en reparto_clientes sin route_id
    hub_ids = [r[0] for r in conn.execute(text("""
        SELECT DISTINCT hub_id FROM reparto_clientes WHERE route_id IS NULL
    """)).fetchall()]

    for hid in hub_ids:
        # busca o crea ruta
        rid = conn.execute(text("""
            SELECT id FROM liquidacion_rutas WHERE hub_id = :hid AND code = 'SIN_RUTA' LIMIT 1
        """), {"hid": hid}).scalar()

        if not rid:
            conn.execute(text("""
                INSERT INTO liquidacion_rutas (hub_id, code, active, created_at)
                VALUES (:hid, 'SIN_RUTA', 1, CURRENT_TIMESTAMP)
            """), {"hid": hid})
            rid = conn.execute(text("""
                SELECT id FROM liquidacion_rutas WHERE hub_id = :hid AND code = 'SIN_RUTA' LIMIT 1
            """), {"hid": hid}).scalar()

        conn.execute(text("""
            UPDATE reparto_clientes SET route_id = :rid
            WHERE hub_id = :hid AND route_id IS NULL
        """), {"hid": hid, "rid": rid})

    # 4) Ahora ya podemos hacer route_id NOT NULL y añadir constraints con NOMBRE
    # SQLite requiere recrear tabla => batch_alter_table
    with op.batch_alter_table("reparto_clientes", schema=None) as batch_op:
        batch_op.alter_column("route_id", existing_type=sa.Integer(), nullable=False)

        # constraints con nombre (MUY IMPORTANTE)
        batch_op.create_foreign_key(
            "fk_reparto_clientes_hub_id",
            "hubs",
            ["hub_id"], ["id"]
        )
        batch_op.create_foreign_key(
            "fk_reparto_clientes_route_id",
            "liquidacion_rutas",
            ["route_id"], ["id"]
        )
        batch_op.create_unique_constraint(
            "uq_reparto_hub_route_cliente",
            ["hub_id", "route_id", "cliente_codigo"]
        )

        # (opcional) si ya no quieres ruta_code después de migrar:
        if _has_column(conn, "reparto_clientes", "ruta_code"):
            batch_op.drop_column("ruta_code")


def downgrade():
    conn = op.get_bind()

    # downgrade simple: quitar constraints y volver route_id nullable (y recrear ruta_code si quieres)
    with op.batch_alter_table("reparto_clientes", schema=None) as batch_op:
        # ojo: en SQLite drop_constraint con batch puede fallar según versión,
        # pero lo dejamos por si acaso.
        try:
            batch_op.drop_constraint("uq_reparto_hub_route_cliente", type_="unique")
        except Exception:
            pass
        try:
            batch_op.drop_constraint("fk_reparto_clientes_route_id", type_="foreignkey")
        except Exception:
            pass
        try:
            batch_op.drop_constraint("fk_reparto_clientes_hub_id", type_="foreignkey")
        except Exception:
            pass

        if _has_column(conn, "reparto_clientes", "route_id"):
            batch_op.alter_column("route_id", existing_type=sa.Integer(), nullable=True)
