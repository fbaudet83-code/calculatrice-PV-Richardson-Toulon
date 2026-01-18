
import { Panel, Component, InverterElectricalSpecs, CompatibilityReport, ConfiguredString, Project } from '../types';

const DEFAULT_TEMP_COEFF_VOC = -0.26; 

export function checkElectricalCompatibility(
  mainPanel: Panel, 
  inverter: Component | null | undefined,
  climate?: { tempMin: number; tempMaxAmb: number },
  panelsPerStringLegacy: number = 1,
  totalPanelsLegacy?: number,
  stringsCountLegacy: number = 1,
  maxPanelsInAStringLegacy: number = 0,
  configuredStrings: ConfiguredString[] = [],
  fields: Project['fields'] = []
): CompatibilityReport {
  const report: CompatibilityReport = {
    isCompatible: true,
    warnings: [],
    errors: [],
    details: null
  };

  const tempMin = climate ? climate.tempMin : -10; 
  const tempAmbHot = climate ? climate.tempMaxAmb : 35; 
  const tempCellHot = tempAmbHot + 35; 

  if (!inverter || !inverter.electrical) {
    return report;
  }

  const iSpecs = inverter.electrical as InverterElectricalSpecs;
  const isMicro = iSpecs.maxInputVoltage < 100;
  
  // DDR Type Logic
  let rcdType: 'A' | 'F' | 'B' = 'F'; // Default for PV
  if (isMicro) rcdType = 'F';
  else if (inverter.id.includes('H1') || inverter.id.includes('H3') || inverter.id.includes('KH') || inverter.id.includes('P3')) {
      rcdType = 'B'; // Hybride/Batterie
  }

  // --- LOGIQUE MICRO-ONDULEUR ---
  if (isMicro) {
      if (!mainPanel || !mainPanel.electrical) return report;
      const pSpecs = mainPanel.electrical;
      const coeffVoc = pSpecs.tempCoeffVoc || DEFAULT_TEMP_COEFF_VOC;
      const deltaTCold = tempMin - 25;
      const vocColdPanel = pSpecs.voc * (1 + (coeffVoc / 100) * deltaTCold);
      
      const inputsPerMicro = iSpecs.mpptCount || 1;
      let totalSystemAcPower = iSpecs.maxAcPower;
      let totalSystemDcPower = mainPanel.power * inputsPerMicro;

      if (totalPanelsLegacy && totalPanelsLegacy > 0) {
          const numMicros = Math.ceil(totalPanelsLegacy / inputsPerMicro);
          totalSystemAcPower = numMicros * iSpecs.maxAcPower;
          totalSystemDcPower = mainPanel.power * totalPanelsLegacy;
      }

      const dcAcRatio = totalSystemAcPower > 0 ? totalSystemDcPower / totalSystemAcPower : 0;
      const nominalAcCurrent = totalSystemAcPower / 230; 
      const recommendedBreaker = nominalAcCurrent * 1.25;

      if (vocColdPanel > iSpecs.maxInputVoltage) {
          report.isCompatible = false;
          report.errors.push(`Tension panneau (${vocColdPanel.toFixed(1)}V) > Max Micro (${iSpecs.maxInputVoltage}V)`);
      }
      
      report.details = {
          vocCold: parseFloat(vocColdPanel.toFixed(1)),
          vmaxInverter: iSpecs.maxInputVoltage,
          vmpHot: 0, 
          vminMppt: iSpecs.minMpptVoltage,
          iscPanel: pSpecs.isc,
          iscCalculation: parseFloat((pSpecs.isc * 1.25).toFixed(2)),
          imaxInverter: iSpecs.maxInputCurrent,
          dcAcRatio: dcAcRatio,
          maxAcPower: totalSystemAcPower,
          nominalAcCurrent: parseFloat(nominalAcCurrent.toFixed(1)),
          recommendedBreaker: Math.ceil(recommendedBreaker),
          rcdType: rcdType,
          tempsUsed: { min: tempMin, maxCell: tempCellHot },
          stringsAnalysis: [],
          maxPanelsInAString: 1
      };
      return report;
  }

  // --- LOGIQUE ONDULEUR CENTRAL ---
  const mpptGroups: Record<number, ConfiguredString[]> = {};
  if (!configuredStrings || configuredStrings.length === 0) {
      const stringsCount = stringsCountLegacy || 1;
      for(let i=0; i<stringsCount; i++) {
          mpptGroups[i+1] = [{ id: `legacy-${i}`, fieldId: 'legacy', panelCount: panelsPerStringLegacy, mpptIndex: i+1 }];
      }
  } else {
      configuredStrings.forEach(str => {
          const idx = str.mpptIndex || 1;
          if (!mpptGroups[idx]) mpptGroups[idx] = [];
          mpptGroups[idx].push(str);
      });
  }

  const mpptAnalyses = [];
  let globalMaxVoc = 0;
  let globalMinVmp = 10000;
  let totalPvPower = 0;
  let maxPanelsCount = 0;

  for (const [mpptIndexStr, segments] of Object.entries(mpptGroups)) {
      const mpptIndex = parseInt(mpptIndexStr);
      let mpptVocCold = 0;
      let mpptVmpHot = 0;
      let mpptIscMax = 0;
      let mpptPanelCount = 0;
      const compositionNames: string[] = [];

      segments.forEach(seg => {
          const field = fields.find(f => f.id === seg.fieldId);
          const panel = field?.panels.model || mainPanel;
          if (panel.electrical) {
              const pSpecs = panel.electrical;
              const coeffVoc = pSpecs.tempCoeffVoc || DEFAULT_TEMP_COEFF_VOC;
              const deltaTCold = tempMin - 25;
              const vocColdPanel = pSpecs.voc * (1 + (coeffVoc / 100) * deltaTCold);
              mpptVocCold += vocColdPanel * seg.panelCount;
              const deltaTHot = tempCellHot - 25;
              const vmpHotPanel = pSpecs.vmp * (1 + (coeffVoc / 100) * deltaTHot);
              mpptVmpHot += vmpHotPanel * seg.panelCount;
              if (pSpecs.isc > mpptIscMax) mpptIscMax = pSpecs.isc;
              totalPvPower += panel.power * seg.panelCount;
          }
          mpptPanelCount += seg.panelCount;
          compositionNames.push(`${field?.name || 'Toiture'} (${seg.panelCount})`);
      });

      if (mpptPanelCount > maxPanelsCount) maxPanelsCount = mpptPanelCount;
      if (mpptVocCold > globalMaxVoc) globalMaxVoc = mpptVocCold;
      if (mpptVmpHot < globalMinVmp) globalMinVmp = mpptVmpHot;

      mpptAnalyses.push({
          mpptIndex: mpptIndex,
          composition: compositionNames.join(' + '),
          totalPanelCount: mpptPanelCount,
          vocCold: parseFloat(mpptVocCold.toFixed(1)),
          vmpHot: parseFloat(mpptVmpHot.toFixed(1)),
          iscMax: mpptIscMax,
          iscCalculation: parseFloat((mpptIscMax * 1.25).toFixed(2)),
          isVoltageError: mpptVocCold > iSpecs.maxInputVoltage,
          isMpptWarning: mpptVmpHot < iSpecs.minMpptVoltage,
          isCurrentError: mpptIscMax > iSpecs.maxInputCurrent
      });

      if (mpptVocCold > iSpecs.maxInputVoltage) {
          report.isCompatible = false;
          report.errors.push(`MPPT ${mpptIndex}: Surtension (${mpptVocCold.toFixed(1)}V > ${iSpecs.maxInputVoltage}V)`);
      }
  }

  const maxAcPower = iSpecs.maxAcPower || inverter.power || 0;
  const dcAcRatio = maxAcPower > 0 ? totalPvPower / maxAcPower : 0;
  
  const isTri = iSpecs.maxAcPower > 6000 || inverter.id.includes('TRI') || inverter.id.includes('T15');
  const nominalAcCurrent = isTri ? maxAcPower / (400 * 1.732) : maxAcPower / 230;

  report.details = {
      vocCold: parseFloat(globalMaxVoc.toFixed(1)),
      vmaxInverter: iSpecs.maxInputVoltage,
      vmpHot: parseFloat(globalMinVmp.toFixed(1)),
      vminMppt: iSpecs.minMpptVoltage,
      iscPanel: mainPanel.electrical?.isc || 0,
      iscCalculation: parseFloat(((mainPanel.electrical?.isc || 0) * 1.25).toFixed(2)),
      imaxInverter: iSpecs.maxInputCurrent,
      dcAcRatio: dcAcRatio,
      maxAcPower: maxAcPower,
      nominalAcCurrent: parseFloat(nominalAcCurrent.toFixed(1)),
      recommendedBreaker: Math.ceil(nominalAcCurrent * 1.25),
      rcdType: rcdType,
      tempsUsed: { min: tempMin, maxCell: tempCellHot },
      stringsAnalysis: mpptAnalyses,
      maxPanelsInAString: maxPanelsCount
  };

  return report;
}
