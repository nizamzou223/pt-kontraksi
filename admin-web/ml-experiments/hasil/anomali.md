# Eksperimen deteksi anomali data kepegawaian

_Dibuat 2026-09-25T16:58:28.079Z • Node v22.16.0 • benih 1..3 • sumber: sintetis_

## Tingkat kesulitan: mudah

≈ 81 anomali disuntikkan per benih; ambang skor 0,5; rata-rata ± simpangan baku lintas 3 benih.

| Metode | ROC-AUC | Presisi | Recall | F1 |
| --- | --- | --- | --- | --- |
| Aturan bisnis saja | 0,862 ± 0,004 | 1,000 ± 0,000 | 0,724 ± 0,008 | 0,840 ± 0,005 |
| Statistik robust saja | 0,833 ± 0,016 | 1,000 ± 0,000 | 0,666 ± 0,031 | 0,799 ± 0,022 |
| Isolation Forest saja | 0,938 ± 0,032 | 1,000 ± 0,000 | 0,205 ± 0,018 | 0,340 ± 0,025 |
| Hibrida (aturan + statistik + Isolation Forest) | 1,000 ± 0,000 | 1,000 ± 0,000 | 1,000 ± 0,000 | 1,000 ± 0,000 |

**Sapuan ambang (hibrida):**

| Ambang | Presisi | Recall | F1 |
| --- | --- | --- | --- |
| 0,40 | 1,00 ± 0,00 | 1,00 ± 0,00 | 1,00 ± 0,00 |
| 0,50 | 1,00 ± 0,00 | 1,00 ± 0,00 | 1,00 ± 0,00 |
| 0,60 | 1,00 ± 0,00 | 1,00 ± 0,00 | 1,00 ± 0,00 |
| 0,70 | 1,00 ± 0,00 | 0,75 ± 0,02 | 0,86 ± 0,01 |
| 0,80 | 1,00 ± 0,00 | 0,65 ± 0,01 | 0,79 ± 0,01 |
| 0,90 | 1,00 ± 0,00 | 0,54 ± 0,02 | 0,70 ± 0,02 |

## Tingkat kesulitan: sulit

≈ 81 anomali disuntikkan per benih; ambang skor 0,5; rata-rata ± simpangan baku lintas 3 benih.

| Metode | ROC-AUC | Presisi | Recall | F1 |
| --- | --- | --- | --- | --- |
| Aturan bisnis saja | 0,860 ± 0,003 | 0,868 ± 0,049 | 0,724 ± 0,008 | 0,789 ± 0,016 |
| Statistik robust saja | 0,766 ± 0,020 | 0,773 ± 0,064 | 0,536 ± 0,039 | 0,632 ± 0,039 |
| Isolation Forest saja | 0,928 ± 0,029 | 1,000 ± 0,000 | 0,163 ± 0,009 | 0,280 ± 0,013 |
| Hibrida (aturan + statistik + Isolation Forest) | 0,988 ± 0,004 | 0,784 ± 0,049 | 0,921 ± 0,019 | 0,847 ± 0,036 |

**Sapuan ambang (hibrida):**

| Ambang | Presisi | Recall | F1 |
| --- | --- | --- | --- |
| 0,40 | 0,78 ± 0,05 | 0,92 ± 0,02 | 0,85 ± 0,04 |
| 0,50 | 0,78 ± 0,05 | 0,92 ± 0,02 | 0,85 ± 0,04 |
| 0,60 | 0,84 ± 0,02 | 0,92 ± 0,02 | 0,88 ± 0,02 |
| 0,70 | 0,93 ± 0,02 | 0,59 ± 0,02 | 0,73 ± 0,02 |
| 0,80 | 0,97 ± 0,03 | 0,54 ± 0,03 | 0,70 ± 0,03 |
| 0,90 | 1,00 ± 0,00 | 0,50 ± 0,03 | 0,67 ± 0,03 |

> **Batasan:** anomali disuntikkan oleh generator yang sama dengan asumsi detektor; ini memeriksa mekanisme, bukan menggantikan evaluasi pada data nyata. Pada data nyata, gunakan status tinjauan admin sebagai label (presisi = valid ÷ ditandai).