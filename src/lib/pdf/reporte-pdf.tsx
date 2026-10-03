import { formatFechaHora } from "@/lib/fechas";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica" },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 2 },
  subtitle: { fontSize: 9, color: "#666666", marginBottom: 16 },
  resumen: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 20,
  },
  resumenItem: {
    borderWidth: 1,
    borderColor: "#dddddd",
    borderRadius: 4,
    padding: 8,
    minWidth: 130,
  },
  resumenLabel: { fontSize: 8, color: "#666666", marginBottom: 2 },
  resumenValor: { fontSize: 13, fontWeight: 700 },
  section: { marginBottom: 18 },
  sectionTitle: { fontSize: 11, fontWeight: 700, marginBottom: 6 },
  table: { display: "flex", width: "auto", borderWidth: 1, borderColor: "#dddddd" },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#dddddd" },
  tableHeader: { backgroundColor: "#f4f4f4", fontWeight: 700 },
  tableCell: { padding: 5, flex: 1, textAlign: "right" },
  tableCellFirst: { padding: 5, flex: 1.6, textAlign: "left" },
  disclaimer: { marginTop: 16, fontSize: 8, color: "#999999" },
});

export type ReportePdfResumenItem = { label: string; valor: string };
export type ReportePdfTabla = {
  titulo?: string;
  columnas: string[];
  filas: (string | number)[][];
};
export type ReportePdfData = {
  titulo: string;
  subtitulo?: string;
  resumen?: ReportePdfResumenItem[];
  tablas: ReportePdfTabla[];
};

export async function renderReportePdf(data: ReportePdfData) {
  return renderToBuffer(<ReportePdf data={data} />);
}

function ReportePdf({ data }: { data: ReportePdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{data.titulo}</Text>
        <Text style={styles.subtitle}>
          Gestión de Préstamos · Generado el {formatFechaHora(new Date())}
          {data.subtitulo ? ` · ${data.subtitulo}` : ""}
        </Text>

        {data.resumen && data.resumen.length > 0 && (
          <View style={styles.resumen}>
            {data.resumen.map((item) => (
              <View key={item.label} style={styles.resumenItem}>
                <Text style={styles.resumenLabel}>{item.label}</Text>
                <Text style={styles.resumenValor}>{item.valor}</Text>
              </View>
            ))}
          </View>
        )}

        {data.tablas.map((tabla, tablaIndex) => (
          <View key={tablaIndex} style={styles.section}>
            {tabla.titulo && <Text style={styles.sectionTitle}>{tabla.titulo}</Text>}
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableHeader]}>
                {tabla.columnas.map((columna, i) => (
                  <Text key={columna} style={i === 0 ? styles.tableCellFirst : styles.tableCell}>
                    {columna}
                  </Text>
                ))}
              </View>
              {tabla.filas.length === 0 && (
                <View style={styles.tableRow}>
                  <Text style={styles.tableCellFirst}>Sin datos.</Text>
                </View>
              )}
              {tabla.filas.map((fila, filaIndex) => (
                <View style={styles.tableRow} key={filaIndex} wrap={false}>
                  {fila.map((celda, celdaIndex) => (
                    <Text
                      key={celdaIndex}
                      style={celdaIndex === 0 ? styles.tableCellFirst : styles.tableCell}
                    >
                      {celda}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          </View>
        ))}

        <Text style={styles.disclaimer}>Reporte generado automáticamente por el sistema.</Text>
      </Page>
    </Document>
  );
}
