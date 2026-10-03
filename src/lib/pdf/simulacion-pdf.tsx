import { formatFecha, hoyCalendario } from "@/lib/fechas";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { generarCuotas, type Frecuencia, type TipoInteres } from "@/lib/prestamos";
import { formatMonto } from "@/lib/format";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica" },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 2 },
  subtitle: { fontSize: 10, color: "#666666", marginBottom: 16 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontWeight: 700, marginBottom: 6 },
  row: { flexDirection: "row", marginBottom: 3 },
  label: { width: 120, color: "#666666" },
  value: { fontWeight: 700 },
  table: { display: "flex", width: "auto", borderWidth: 1, borderColor: "#dddddd" },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#dddddd" },
  tableHeader: { backgroundColor: "#f4f4f4", fontWeight: 700 },
  tableCell: { padding: 6, flex: 1, textAlign: "right" },
  tableCellFirst: { padding: 6, flex: 0.6, textAlign: "left" },
  footer: { marginTop: 12, textAlign: "right", fontSize: 12, fontWeight: 700 },
  disclaimer: { marginTop: 24, fontSize: 8, color: "#999999" },
});

const frecuenciaLabel: Record<Frecuencia, string> = {
  DIARIA: "Diaria",
  SEMANAL: "Semanal",
  QUINCENAL: "Quincenal",
  MENSUAL: "Mensual",
};

const tipoInteresLabel: Record<TipoInteres, string> = {
  FRANCES: "Francés (cuota fija)",
  ALEMAN: "Alemán (capital fijo)",
  SIMPLE: "Interés simple",
};

export type SimulacionPdfData = {
  clienteNombre: string;
  clienteEmail?: string | null;
  monto: number;
  /** Interés total fijo del préstamo. Si está presente, se usa el modo de reparto fijo (monto + interés / cuotas). */
  interes?: number | null;
  /** Campos del modo legado (TNA + IVA + tipo), usados solo cuando `interes` no está presente. */
  tasaInteres?: number | null;
  iva?: number | null;
  tipoInteres?: TipoInteres | null;
  cantidadCuotas: number;
  frecuencia: Frecuencia;
  fechaInicio: Date;
};

export async function renderSimulacionPdf(simulacion: SimulacionPdfData) {
  return renderToBuffer(<SimulacionPdf simulacion={simulacion} />);
}

function SimulacionPdf({ simulacion }: { simulacion: SimulacionPdfData }) {
  const esInteresFijo = simulacion.interes !== undefined && simulacion.interes !== null;
  const cuotas = esInteresFijo
    ? generarCuotas({
        monto: simulacion.monto,
        interes: simulacion.interes!,
        cantidadCuotas: simulacion.cantidadCuotas,
        frecuencia: simulacion.frecuencia,
        fechaInicio: simulacion.fechaInicio,
      })
    : generarCuotas({
        monto: simulacion.monto,
        tasaInteres: simulacion.tasaInteres!,
        iva: simulacion.iva ?? 0,
        cantidadCuotas: simulacion.cantidadCuotas,
        tipoInteres: simulacion.tipoInteres!,
        frecuencia: simulacion.frecuencia,
        fechaInicio: simulacion.fechaInicio,
      });
  const totalCuotas = cuotas.reduce((sum, c) => sum + c.montoTotal, 0);
  const montoFinanciado = Math.round(simulacion.monto * (1 + (simulacion.iva ?? 0) / 100));

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Simulación de préstamo</Text>
        <Text style={styles.subtitle}>Gestión de Préstamos · Generado el {formatFecha(hoyCalendario())}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cliente</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Nombre</Text>
            <Text style={styles.value}>{simulacion.clienteNombre}</Text>
          </View>
          {simulacion.clienteEmail && (
            <View style={styles.row}>
              <Text style={styles.label}>Email</Text>
              <Text style={styles.value}>{simulacion.clienteEmail}</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Condiciones del préstamo</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Monto</Text>
            <Text style={styles.value}>{formatMonto(simulacion.monto)}</Text>
          </View>
          {esInteresFijo ? (
            <View style={styles.row}>
              <Text style={styles.label}>Interés</Text>
              <Text style={styles.value}>{formatMonto(simulacion.interes!)}</Text>
            </View>
          ) : (
            <>
              <View style={styles.row}>
                <Text style={styles.label}>Tasa de interés anual (TNA)</Text>
                <Text style={styles.value}>{simulacion.tasaInteres}%</Text>
              </View>
              {(simulacion.iva ?? 0) > 0 && (
                <View style={styles.row}>
                  <Text style={styles.label}>IVA (financiado sobre el capital)</Text>
                  <Text style={styles.value}>
                    {simulacion.iva}% · Monto financiado: {formatMonto(montoFinanciado)}
                  </Text>
                </View>
              )}
            </>
          )}
          <View style={styles.row}>
            <Text style={styles.label}>Cantidad de cuotas</Text>
            <Text style={styles.value}>{simulacion.cantidadCuotas}</Text>
          </View>
          {!esInteresFijo && (
            <View style={styles.row}>
              <Text style={styles.label}>Tipo de interés</Text>
              <Text style={styles.value}>{tipoInteresLabel[simulacion.tipoInteres!]}</Text>
            </View>
          )}
          <View style={styles.row}>
            <Text style={styles.label}>Frecuencia</Text>
            <Text style={styles.value}>{frecuenciaLabel[simulacion.frecuencia]}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Fecha de inicio</Text>
            <Text style={styles.value}>{formatFecha(simulacion.fechaInicio)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cronograma de cuotas</Text>
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <Text style={styles.tableCellFirst}>#</Text>
              <Text style={styles.tableCell}>Vencimiento</Text>
              <Text style={styles.tableCell}>Capital</Text>
              <Text style={styles.tableCell}>Interés</Text>
              <Text style={styles.tableCell}>Total</Text>
            </View>
            {cuotas.map((cuota) => (
              <View style={styles.tableRow} key={cuota.numero}>
                <Text style={styles.tableCellFirst}>{cuota.numero}</Text>
                <Text style={styles.tableCell}>{formatFecha(cuota.fechaVencimiento)}</Text>
                <Text style={styles.tableCell}>{formatMonto(cuota.montoCapital)}</Text>
                <Text style={styles.tableCell}>{formatMonto(cuota.montoInteres)}</Text>
                <Text style={styles.tableCell}>{formatMonto(cuota.montoTotal)}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.footer}>Total a pagar: {formatMonto(totalCuotas)}</Text>
        </View>

        <Text style={styles.disclaimer}>
          Esta simulación es orientativa y no constituye una oferta de crédito vinculante.
        </Text>
      </Page>
    </Document>
  );
}
