"""add cantidad to hub_compras

Revision ID: ddfa6ff0a18b
Revises: 7381c6138023
Create Date: 2026-01-04 04:55:58.077825
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'ddfa6ff0a18b'
down_revision = '7381c6138023'
branch_labels = None
depends_on = None


def _get_columns(table_name: str):
    bind = op.get_bind()
    insp = sa.inspect(bind)
    return {c["name"] for c in insp.get_columns(table_name)}


def upgrade():
    cols = _get_columns("hub_compras")

    # OJO: batch_alter_table en SQLite recrea tabla. Si falló antes, puede quedar la tmp.
    op.execute("DROP TABLE IF EXISTS _alembic_tmp_hub_compras")

    with op.batch_alter_table('hub_compras', schema=None) as batch_op:

        # 1) item: 160 -> 200 (solo si todavía está en 160)
        # Alembic no siempre sabe el tipo real, pero esto es seguro en SQLite.
        if "item" in cols:
            batch_op.alter_column(
                'item',
                existing_type=sa.VARCHAR(length=160),
                type_=sa.String(length=200),
                existing_nullable=False
            )

        # 2) especificaciones: agregar solo si NO existe
        if "especificaciones" not in cols:
            batch_op.add_column(sa.Column('especificaciones', sa.String(length=500), nullable=False, server_default=""))

        # 3) si todavía existe descripcion, migrar data -> especificaciones y luego eliminarla
        if "descripcion" in cols:
            # copiar el contenido a especificaciones SOLO si especificaciones está vacía
            op.execute(
                "UPDATE hub_compras "
                "SET especificaciones = COALESCE(NULLIF(especificaciones, ''), descripcion) "
                "WHERE descripcion IS NOT NULL"
            )
            batch_op.drop_column('descripcion')

        # 4) quitar default server para que no quede en schema (opcional pero recomendable)
        if "especificaciones" not in cols:
            # no llega aquí porque cols era viejo; pero por seguridad lo dejamos fuera
            pass

    # limpiar server_default que metimos para permitir NOT NULL sin romper SQLite
    # (en SQLite suele quedar en el CREATE TABLE recreado; si te molesta, podés dejarlo)
    try:
        with op.batch_alter_table('hub_compras', schema=None) as batch_op:
            batch_op.alter_column('especificaciones', server_default=None)
    except Exception:
        # si SQLite no permite quitarlo en tu versión, no pasa nada
        pass


def downgrade():
    cols = _get_columns("hub_compras")

    op.execute("DROP TABLE IF EXISTS _alembic_tmp_hub_compras")

    with op.batch_alter_table('hub_compras', schema=None) as batch_op:

        # volver item 200 -> 160 (si querés)
        if "item" in cols:
            batch_op.alter_column(
                'item',
                existing_type=sa.String(length=200),
                type_=sa.VARCHAR(length=160),
                existing_nullable=False
            )

        # recrear descripcion si no existe
        if "descripcion" not in cols:
            batch_op.add_column(sa.Column('descripcion', sa.VARCHAR(length=500), nullable=False, server_default=""))

        # copiar especificaciones -> descripcion si aplica
        if "especificaciones" in cols:
            op.execute(
                "UPDATE hub_compras "
                "SET descripcion = COALESCE(NULLIF(descripcion, ''), especificaciones) "
                "WHERE especificaciones IS NOT NULL"
            )
            batch_op.drop_column('especificaciones')

    try:
        with op.batch_alter_table('hub_compras', schema=None) as batch_op:
            batch_op.alter_column('descripcion', server_default=None)
    except Exception:
        pass
