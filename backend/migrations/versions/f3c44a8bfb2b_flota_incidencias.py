"""flota incidencias

Revision ID: f3c44a8bfb2b
Revises: ddfa6ff0a18b
Create Date: 2026-01-04 ...

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "f3c44a8bfb2b"
down_revision = "ddfa6ff0a18b"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "flota_incidencias",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("hub_id", sa.Integer(), nullable=False),
        sa.Column("vehiculo_id", sa.Integer(), nullable=False),

        sa.Column("titulo", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("descripcion", sa.String(length=1000), nullable=False, server_default=""),

        sa.Column("coste", sa.Float(), nullable=False, server_default="0"),
        sa.Column("km", sa.Integer(), nullable=False, server_default="0"),

        sa.Column("fecha", sa.Date(), nullable=False),

        sa.Column("created_at", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),

        sa.ForeignKeyConstraint(["hub_id"], ["hubs.id"], name="fk_flota_incidencias_hub_id"),
        sa.ForeignKeyConstraint(["vehiculo_id"], ["flota_vehiculos.id"], name="fk_flota_incidencias_vehiculo_id"),
    )

    # Opcional: índice para listar rápido por vehículo/fecha
    op.create_index(
        "ix_flota_incidencias_vehiculo_fecha",
        "flota_incidencias",
        ["vehiculo_id", "fecha"],
        unique=False,
    )


def downgrade():
    op.drop_index("ix_flota_incidencias_vehiculo_fecha", table_name="flota_incidencias")
    op.drop_table("flota_incidencias")
