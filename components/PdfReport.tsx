
// @ts-nocheck
import { useMemo } from 'react';
import React from 'react';
import { Project, Material, InverterBrand, CompatibilityReport, Component } from '../types';
import { groupMaterialsByCategory } from '../services/calculatorService';
import { getLocationClimate } from '../services/climateService';
import type { MicroBranchesReport } from '../services/microBranchService';
import { getSubscriptionStatus } from '../services/subscriptionService';
import RoofVisualizer from './RoofVisualizer';
import InstallationDiagram from './InstallationDiagram';
import ElectricalSchematic from './ElectricalSchematic';
import { ENPHASE_COMPONENTS, APSYSTEMS_COMPONENTS, FOXESS_COMPONENTS } from '../data/inverters';

interface PdfReportProps {
  project: Project;
  materials: Material[];
  exportOptions: {
    includeDatasheets: boolean;
    includeGuides: boolean;
    includeRegulations: boolean;
  };
  report: CompatibilityReport | null;
  voltageDrop: number; 
  acSection: number;   
  microBranchesReport?: MicroBranchesReport | null;
}

const ITEMS_PER_PAGE = 14;

type PrintableRow = 
  | { type: 'header'; title: string }
  | { type: 'subheader'; title: string }
  | { type: 'item'; material: Material }
  | { type: 'warning'; text: string };

const DocLink = ({ title, url, icon = "📄" }: { title: string, url: string, icon?: string }) => (
    <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors group text-decoration-none">
        <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-lg group-hover:scale-110 transition-transform shadow-sm">
            {icon}
        </div>
        <div className="flex-1 overflow-hidden">
            <div className="font-bold text-slate-700 text-[10px] uppercase tracking-wide leading-tight">{title}</div>
            <div className="text-[8px] text-blue-600 underline truncate w-full">{url}</div>
        </div>
        <div className="text-slate-300 group-hover:text-blue-500 text-xs font-bold">➜</div>
    </a>
);

const PdfReport: React.FC<PdfReportProps> = ({ project, materials, exportOptions, report, voltageDrop, acSection, microBranchesReport }) => {
  const totalPowerW = project.fields.reduce((sum, f) => sum + (f.panels.model.power * f.panels.rows * f.panels.columns), 0);
  const totalPowerkWc = (totalPowerW / 1000).toFixed(2);
  
  const isThreePhase = project.inverterConfig.phase === 'Tri';
  const firstField = project.fields[0];
  const activePanel = firstField.panels.model;
  
  const climate = getLocationClimate(project.postalCode, project.altitude);
  
  const vocColdString = report?.details?.vocCold || 0;
  const vmpHotString = report?.details?.vmpHot || 0;
  const dcAcRatio = report?.details?.dcAcRatio ? report.details.dcAcRatio * 100 : 0;
  const invVmaxLimit = report?.details?.vmaxInverter || (isThreePhase ? 1000 : 600);
  const invVmpMin = report?.details?.vminMppt || 80;

  const stringsAnalysis = report?.details?.stringsAnalysis || [];
  const mpptCount = stringsAnalysis.length;

  const configuredStrings = project.inverterConfig.configuredStrings || [];
  const mpptParallelCounts: Record<number, number> = configuredStrings.reduce((acc: any, s: any) => {
    const idx = Number(s.mpptIndex || 1);
    acc[idx] = (acc[idx] || 0) + 1;
    return acc;
  }, {});
  const maxParallelStringsOnAnyMppt = Object.values(mpptParallelCounts).reduce((m: number, v: any) => Math.max(m, Number(v) || 0), 0);
  // Règle simplifiée (pédagogique) : fusibles gPV requis uniquement si >2 strings en parallèle sur un même MPPT
  const gpvRequired = maxParallelStringsOnAnyMppt > 2;

  const hasMicroBranches = !!(microBranchesReport && microBranchesReport.branches && microBranchesReport.branches.length > 0);
  const worstBranchDrop = hasMicroBranches ? Math.max(...microBranchesReport!.branches.map((b: any) => b.dropPercent || 0)) : 0;
  const totalProductionDrop = hasMicroBranches ? (worstBranchDrop + (voltageDrop || 0)) : (voltageDrop || 0);

  const today = new Date().toLocaleDateString('fr-FR');

  const subscriptionStatus = getSubscriptionStatus({
    phase: isThreePhase ? 'Tri' : 'Mono',
    projectPowerKwc: totalPowerW / 1000,
    agcpA: project.inverterConfig.agcpValue,
  });

  const allInverters = useMemo((): Record<string, Component> => ({ ...ENPHASE_COMPONENTS, ...APSYSTEMS_COMPONENTS, ...FOXESS_COMPONENTS }), []);

  const projectDocs = useMemo(() => {
    const invModelId = project.inverterConfig.model;
    const selectedInv = (Object.values(allInverters) as Component[]).find((c) => c.id === invModelId);

    let genericInvUrl = "https://www.google.com/search?q=" + project.inverterConfig.brand;
    if (project.inverterConfig.brand === InverterBrand.FOXESS) genericInvUrl = "https://fr.fox-ess.com/download/";
    else if (project.inverterConfig.brand === InverterBrand.ENPHASE) genericInvUrl = "https://support.enphase.com/s/article/video-iq-microinverter-installationsguide";
    else if (project.inverterConfig.brand === InverterBrand.APSYSTEMS) genericInvUrl = "https://emea.apsystems.com/document-library/";

    return {
        structure: {
            brand: project.system.brand,
            videos: project.system.brand === 'K2' 
                ? [
                    { title: "Installation K2 SingleRail", url: "https://youtu.be/drCs25sMDgE?si=dMfyGLM-dh1V2cby" },
                    { title: "Fixations sur tuiles K2", url: "https://www.youtube.com/watch?v=drCs25sMDgE" }
                  ] 
                : [
                    { title: "Installation ClickFit EVO Tuiles", url: "https://www.youtube.com/watch?v=wlc8v_cif1A" }
                  ],
            manuals: project.system.brand === 'K2'
                ? ["https://catalogue.k2-systems.com/media/7b/4e/d3/Product-Brochure-fr.pdf"]
                : ["https://www.esdec.com/wp-content/uploads/2023/03/Manual_ClickFitEvo_TiledRoof_306_FR.pdf"]
        },
        panel: {
            name: activePanel.name,
            datasheet: activePanel.datasheetUrl || `https://www.google.com/search?q=${encodeURIComponent(activePanel.name)}+datasheet`,
            manual: activePanel.manualUrl || `https://www.google.com/search?q=${encodeURIComponent(activePanel.name)}+manual`,
            video: activePanel.videoUrl
        },
        inverter: {
            brand: project.inverterConfig.brand,
            model: selectedInv ? selectedInv.description : project.inverterConfig.model,
            datasheet: selectedInv?.datasheetUrl || genericInvUrl,
            manual: selectedInv?.manualUrl || genericInvUrl,
            video: selectedInv?.videoUrl,
            genericUrl: genericInvUrl,
            foxCommissioningUrl: project.inverterConfig.brand === InverterBrand.FOXESS ? "https://pis.powr.group/install-foxess" : null
        }
    };
  }, [project, activePanel, allInverters]);

  const printableRows = useMemo(() => {
    const grouped = groupMaterialsByCategory(materials);
    const rows: PrintableRow[] = [];
    
    const addItemWithWarning = (item: Material) => {
        rows.push({ type: 'item', material: item });
        if (item.description.toLowerCase().includes('coffret ac') && (!project.inverterConfig.agcpValue || project.inverterConfig.agcpValue <= 0)) {
            rows.push({ type: 'warning', text: "Disjoncteur non livré dans les coffrets AC à calibrer et a ajouter en fonction de l'AGCP client" });
        }
    };

    grouped.forEach(g => {
        rows.push({ type: 'header', title: g.category });
        g.items.forEach(item => addItemWithWarning(item));
        if (g.subSections) {
            g.subSections.forEach(sub => {
                rows.push({ type: 'subheader', title: sub.title });
                sub.items.forEach(item => addItemWithWarning(item));
            });
        }
    });
    return rows;
  }, [materials, project.inverterConfig.agcpValue]);

  const materialChunks = useMemo(() => {
    const chunks = [];
    for (let i = 0; i < printableRows.length; i += ITEMS_PER_PAGE) {
      chunks.push(printableRows.slice(i, i + ITEMS_PER_PAGE));
    }
    return chunks.length > 0 ? chunks : [[]];
  }, [printableRows]);

  const materialPages = materialChunks.length;
  const showDoc = exportOptions.includeGuides;
  const showRegul = exportOptions.includeRegulations;
  
  const totalPages = 1 + (project.fields.length * 2) + 2 + (exportOptions.includeDatasheets ? 2 : 1) + materialPages + (showDoc ? 2 : 0) + (showRegul ? 1 : 0);

  const CommonHeader = ({ title }: { title: string }) => (
    <header className="flex justify-between items-end mb-6 border-b border-slate-200 pb-2">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8">
            <svg viewBox="0 0 100 100"><path d="M50 5 L90 25 L90 75 L50 95 L10 75 L10 25 Z" fill="#eab308" /><path d="M50 5 L90 25 L50 45 L10 25 Z" fill="#84cc16" /><path d="M50 45 L90 25 L90 75 L50 95 Z" fill="#db2777" /></svg>
        </div>
        <div className="flex flex-col">
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">{title}</h2>
          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Richardson Solaire v3.0</span>
        </div>
      </div>
      <div className="text-right">
        <span className="text-sm font-bold text-slate-700">{project.name}</span>
      </div>
    </header>
  );

  const CommonFooter = ({ page }: { page: number }) => (
    <footer className="mt-auto pt-4 border-t border-slate-100 flex justify-between text-[9px] text-slate-400">
      <span>Richardson Solaire - Dossier d'aide au chiffrage - Document non contractuel</span>
      <span>Page {page}/{totalPages}</span>
    </footer>
  );

  return (
    <div id="pdf-report-source" className="hidden bg-white text-slate-800 font-sans text-left">
      
      {/* PAGE 1 : COUVERTURE */}
      <div className="pdf-page w-[210mm] h-[297mm] bg-white relative flex flex-col overflow-hidden">
        <div className="h-[60%] relative">
            <img src="https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?q=80&w=1200&auto=format&fit=crop" className="w-full h-full object-cover" alt="Solar Field" />
            <div className="absolute top-12 left-12"><span className="text-white font-black tracking-widest text-sm uppercase">RICHARDSON</span></div>
            <div className="absolute inset-0 flex flex-col justify-center p-16">
                <h1 className="text-[64px] font-black text-white leading-none drop-shadow-2xl">Dossier Technique</h1>
                <h2 className="text-[64px] font-black text-yellow-400 leading-none drop-shadow-2xl mt-2">Photovoltaïque</h2>
                <div className="flex items-center gap-4 mt-6">
                    <div className="w-1.5 h-10 bg-orange-500"></div>
                    <p className="text-white/90 text-xl font-medium tracking-tight">Etude d'aide au dimensionnement et au chiffrage</p>
                </div>
            </div>
        </div>
        <div className="flex-1 p-20 flex justify-between items-start relative">
            <div className="flex gap-8 items-stretch">
                <div className="w-1.5 bg-slate-900"></div>
                <div className="space-y-8">
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">PROJET</label>
                        <h3 className="text-3xl font-black text-slate-800 tracking-tight">{project.name || 'Nouveau Projet'}</h3>
                        <p className="text-slate-500 font-bold text-lg mt-1">{project.postalCode} {project.city}</p>
                    </div>
                    <div className="flex gap-12">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">PUISSANCE INSTALLÉE</label>
                            <span className="text-2xl font-black text-slate-800">{totalPowerkWc} kWc</span>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">DATE</label>
                            <span className="text-2xl font-black text-slate-800">{today}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Note abonnement / puissance souscrite (bas de page 1) */}
            <div className="absolute bottom-10 left-20 right-20">
              <div className="border-t border-slate-200 pt-3 text-[10px] text-slate-600 leading-snug">
                <div className="font-black text-slate-700 uppercase tracking-widest text-[9px] mb-1">Condition de validité de l'étude</div>
                <div>
                  Cette étude est réalisée pour une puissance installée de <span className="font-black">{totalPowerkWc} kWc</span>. La faisabilité est conditionnée à une puissance souscrite au point de livraison compatible.
                  {subscriptionStatus.recommendedKva ? (
                    <> Abonnement minimal conseillé : <span className="font-black">{subscriptionStatus.recommendedKva} kVA</span> ({subscriptionStatus.phase === 'Mono' ? 'mono' : 'tri'}).
                    </>
                  ) : null}
                </div>
                <div className="mt-1">
                  {subscriptionStatus.subscribedKva == null ? (
                    <span className="font-bold">Puissance souscrite non renseignée (AGCP). À vérifier auprès du fournisseur/gestionnaire de réseau.</span>
                  ) : subscriptionStatus.isOk ? (
                    <span className="font-bold text-green-700">Abonnement renseigné : {subscriptionStatus.subscribedKva} kVA — compatible.</span>
                  ) : (
                    <span className="font-bold text-red-700">Abonnement renseigné : {subscriptionStatus.subscribedKva} kVA — à faire évoluer.</span>
                  )}
                  <span className="text-slate-500"> Limites usuelles : 12 kVA max en monophasé, 36 kVA max en triphasé, sous réserve de compatibilité du site/réseau.</span>
                </div>
              </div>
            </div>
        </div>
      </div>

      {/* PAGES TOITURES */}
      {project.fields.map((field, index) => (
        <React.Fragment key={field.id}>
          <div className="pdf-page w-[210mm] h-[297mm] p-[15mm] flex flex-col bg-white">
            <CommonHeader title={`Vue d'ensemble - ${field.name}`} />
            <div className="mt-4 mb-10 text-left"><h3 className="text-2xl font-black text-slate-800">Configuration - {field.name}</h3></div>
            <div className="grid grid-cols-12 gap-12">
                <div className="col-span-6"><div className="bg-orange-50/50 rounded-3xl p-10 border border-orange-100 shadow-sm"><RoofVisualizer roof={field.roof} panels={field.panels} bare maxDimension={320} /></div></div>
                <div className="col-span-6 space-y-10">
                    <section><h4 className="text-[11px] font-black text-orange-500 uppercase tracking-widest border-b-2 border-orange-500 w-fit mb-5">Spécifications</h4>
                        <table className="w-full text-sm">
                            <tbody className="divide-y divide-slate-100">
                                <tr><td className="py-2.5 text-slate-400">Module</td><td className="py-2.5 font-bold text-right">{field.panels.model.name}</td></tr>
                                <tr><td className="py-2.5 text-slate-400">Quantité (ce champ)</td><td className="py-2.5 font-bold text-right">{field.panels.rows * field.panels.columns} panneaux</td></tr>
                                <tr><td className="py-2.5 text-slate-400">Puissance Champ</td><td className="py-2.5 font-bold text-right">{((field.panels.rows * field.panels.columns * field.panels.model.power) / 1000).toFixed(2)} kWc</td></tr>
                                <tr><td className="py-2.5 text-slate-400">Orientation</td><td className="py-2.5 font-bold text-right">{field.panels.orientation}</td></tr>
                            </tbody>
                        </table>
                    </section>
                </div>
            </div>
            <CommonFooter page={1 + (index * 2) + 1} />
          </div>

          <div className="pdf-page w-[210mm] h-[297mm] p-[15mm] flex flex-col bg-white">
            <CommonHeader title={`Plan de Calpinage - ${field.name}`} />
            <div className="flex-1 bg-slate-50 border border-slate-200 rounded-3xl p-12 flex items-center justify-center overflow-hidden shadow-inner my-6">
                <InstallationDiagram roof={field.roof} panels={field.panels} system={project.system} railOrientation={field.railOrientation} />
            </div>
            <CommonFooter page={1 + (index * 2) + 2} />
          </div>
        </React.Fragment>
      ))}

      {/* --- PAGE ÉLECTRIQUE 1/2 : AUDIT DC --- */}
      {exportOptions.includeDatasheets && (
      <div className="pdf-page w-[210mm] h-[297mm] p-[15mm] flex flex-col bg-white overflow-hidden text-left">
        <CommonHeader title="Analyse Électrique 1/2 - Coté DC" />
        <h1 className="text-2xl font-black text-slate-800 mb-2">Audit Sécurité DC (Générateur PV)</h1>
        <p className="text-slate-500 text-xs mb-6 uppercase font-bold">Vérifications normatives selon le guide UTE C15-712-1</p>

        <section className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col">
                <h3 className="text-[10px] font-black text-slate-400 uppercase mb-3 tracking-widest">Calculs de Tension (Sécurité)</h3>
                <div className="space-y-4">
                    <div>
                        <span className="block text-[8px] font-black text-slate-400 uppercase">Voc Corrigée @ {climate.tempMin}°C</span>
                        <div className={`text-2xl font-black ${vocColdString > invVmaxLimit ? 'text-red-600' : 'text-slate-800'}`}>{vocColdString.toFixed(1)} V</div>
                        <p className="text-[8px] text-slate-400 mt-1 italic leading-tight">Limite max onduleur : {invVmaxLimit} V</p>
                        <div className="mt-2 text-[8px] text-slate-500 leading-tight">
                          <span className="font-black">Lecture :</span> Voc_STC = tension à vide à 25°C • k_voc = coeff. température Voc (%/°C) • Tmin = température mini locale • N = nb de modules en série (chaîne la plus longue).
                        </div>
                    </div>
                </div>
                <div className="mt-2 text-[8px] text-slate-500 leading-tight">
                    <div className="font-black text-slate-500 uppercase tracking-widest text-[7px] mb-1">Lecture rapide</div>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li><b>Uoc_STC</b> : tension à vide du module à 25°C.</li>
                      <li><b>k_voc</b> : coefficient de température ("%/°C").</li>
                      <li><b>Tmin</b> : température de calcul (site).</li>
                      <li><b>N</b> : nb de modules en série (micro-onduleur : N=1).</li>
                    </ul>
                </div>
                {/* FORMULE DC TENSION */}
                <div className="mt-auto pt-3 border-t border-slate-200 font-mono text-[6.5px] text-slate-400 leading-[1.3]">
                    <span className="font-bold text-slate-500 block mb-0.5 uppercase tracking-tighter">Méthode de calcul :</span>
                    Uoc(Tmin) = Uoc_stc × [1 + (k_voc / 100) × (Tmin - 25)] × N_panneaux<br/>
                    Valeurs : {activePanel.electrical?.voc}V × [1 + ({activePanel.electrical?.tempCoeffVoc}/100) × ({climate.tempMin} - 25)] × {report?.details?.maxPanelsInAString}
                </div>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col">
                <h3 className="text-[10px] font-black text-slate-400 uppercase mb-3 tracking-widest">Calculs de Courant (Dimensionnement)</h3>
                <div className="space-y-4">
                    <div>
                        <span className="block text-[8px] font-black text-slate-400 uppercase">Isc calculé (Isc × 1,25)</span>
                        <div className="text-2xl font-black text-slate-800">{(report?.details?.iscCalculation || 0).toFixed(2)} A</div>
                        <p className="text-[8px] text-slate-400 mt-1 italic">Isc module STC : {report?.details?.iscPanel} A</p>
                    </div>
                </div>
                {/* FORMULE DC COURANT */}
                <div className="mt-auto pt-3 border-t border-slate-200 font-mono text-[6.5px] text-slate-400 leading-[1.3]">
                    <span className="font-bold text-slate-500 block mb-0.5 uppercase tracking-tighter">Méthode de calcul :</span>
                    Isc_corrige = Isc_stc × 1.25 (Sécurité normative)<br/>
                    Valeurs : {report?.details?.iscPanel}A × 1.25 = {(report?.details?.iscCalculation || 0).toFixed(2)}A
                </div>
            </div>
        </section>

        <section className="mb-6">
            <h3 className="text-[10px] font-black text-slate-800 uppercase mb-3 tracking-tight border-b pb-1">Répartition détaillée des chaînes (MPPT)</h3>
            <div className="space-y-3">
               {stringsAnalysis.map((str, idx) => (
                   <div key={idx} className="bg-slate-800 text-white rounded-xl p-4 flex justify-between items-center shadow-md">
                       <div className="flex-1">
                           <div className="flex items-center gap-3 mb-1">
                               <span className="bg-blue-500 text-[10px] font-black px-2 py-0.5 rounded">MPPT #{str.mpptIndex}</span>
                               <span className="text-[9px] font-bold text-orange-400">{str.composition}</span>
                           </div>
                           <div className="grid grid-cols-3 gap-4 mt-3">
                               <div><label className="block text-[7px] text-slate-400 font-black uppercase">Tension Hiver</label><span className="text-sm font-mono font-bold text-slate-100">{str.vocCold} V</span></div>
                               <div><label className="block text-[7px] text-slate-400 font-black uppercase">Tension Eté (Vmp)</label><span className="text-sm font-mono font-bold text-green-400">{str.vmpHot} V</span></div>
                               <div><label className="block text-[7px] text-slate-400 font-black uppercase">Isc de calcul</label><span className="text-sm font-mono font-bold text-blue-300">{str.iscCalculation} A</span></div>
                           </div>
                       </div>
                       <div className="text-right border-l border-slate-700 pl-6 ml-6">
                           <div className="text-[20px] font-black text-white">{str.totalPanelCount}</div>
                           <div className="text-[8px] font-black uppercase text-slate-500 text-center">Panneaux</div>
                       </div>
                   </div>
               ))}
            </div>
        </section>

        <section className="mb-6">
            <h3 className="text-[10px] font-black text-slate-800 uppercase mb-3 tracking-tight">Validation Matériel de protection DC</h3>
            <div className="border border-slate-100 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-[9px]">
                    <thead className="bg-slate-50 text-slate-400 font-black uppercase">
                        <tr><th className="p-3 text-left">Composant de sécurité</th><th className="p-3 text-left">Vérification normative</th><th className="p-3 text-center">Verdict</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-left">
                        <tr><td className="p-3">Sectionneur DC (Load Break)</td><td className="p-3">In ≥ Isc_calc ({(report?.details?.iscCalculation || 0).toFixed(2)}A) et Un ≥ Uoc_max ({vocColdString}V)</td><td className="p-3 text-center text-green-600 font-bold">VALIDE</td></tr>
                        <tr><td className="p-3">Parafoudre DC (SPD Type 2)</td><td className="p-3">Protection contre les surtensions atmosphériques (Guide 15-712-1)</td><td className="p-3 text-center text-green-600 font-bold">INCLUS</td></tr>
                        {gpvRequired && (
                          <tr>
                            <td className="p-3">Fusibles gPV</td>
                            <td className="p-3">In ≥ 1.5 × Isc_module (si &gt; 2 strings en parallèle sur un même MPPT)</td>
                            <td className="p-3 text-center text-orange-600 font-black">À PRÉVOIR</td>
                          </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </section>

        <CommonFooter page={1 + (project.fields.length * 2) + 1} />
      </div>
      )}

      {/* --- PAGE ÉLECTRIQUE 2/2 : AUDIT AC & SYNTHÈSE CONSUEL --- */}
      <div className="pdf-page w-[210mm] h-[297mm] p-[15mm] flex flex-col bg-white overflow-hidden text-left">
        <CommonHeader title="Analyse Électrique 2/2 - Coté AC" />
        <h1 className="text-2xl font-black text-slate-800 mb-2">Audit Liaison AC & Synthèse Consuel</h1>
        <p className="text-slate-500 text-xs mb-6 uppercase font-bold">Vérifications normatives selon le guide NFC 15-100</p>

        <section className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100 shadow-sm relative overflow-hidden flex flex-col">
                <div className="absolute top-2 right-4 text-[40px] opacity-10 font-black text-blue-900">AC</div>
                <h3 className="text-[10px] font-black text-blue-900 uppercase mb-4 tracking-widest">Spécifications de Sortie</h3>
                <div className="space-y-4 mb-6">
                    <div className="flex justify-between items-end">
                        <div><span className="block text-[8px] font-black text-blue-400 uppercase">In Max AC Onduleur</span><div className="text-2xl font-black text-blue-900">{report?.details?.nominalAcCurrent} A</div></div>
                        <div className="text-right"><span className="block text-[8px] font-black text-blue-400 uppercase">Réseau</span><div className="text-sm font-black text-blue-900 uppercase">{project.inverterConfig.phase} 230V</div></div>
                    </div>
                    <div className="h-px bg-blue-200"></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-[7px] text-blue-400 font-black uppercase">Calibre Disjoncteur</label><span className="text-sm font-bold text-blue-900">{report?.details?.recommendedBreaker}A (Min.)</span></div>
                        <div><label className="block text-[7px] text-blue-400 font-black uppercase">Type Différentiel (DDR)</label><span className="text-sm font-bold text-blue-900">Type {report?.details?.rcdType} (30mA)</span></div>
                    </div>
                </div>
                {/* FORMULE AC COURANT */}
                <div className="mt-auto pt-3 border-t border-blue-100 font-mono text-[6.5px] text-blue-400 leading-[1.3]">
                    <span className="font-bold text-blue-500 block mb-0.5 uppercase tracking-tighter">Note de calcul AC :</span>
                    In_max = P_ac / (U_reseau {isThreePhase ? '× √3' : ''})<br/>
                    Valeurs : {report?.details?.maxAcPower}W / ({isThreePhase ? '400V × 1.732' : '230V'}) = {report?.details?.nominalAcCurrent}A
                </div>
            </div>
            
            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col">
                <h3 className="text-[10px] font-black text-slate-400 uppercase mb-4 tracking-widest">Dimensionnement Câble</h3>
                <div className="space-y-4 mb-6">
                    <div className="flex justify-between items-end">
                        <div><span className="block text-[8px] font-black text-slate-400 uppercase">Section Câble</span><div className="text-2xl font-black text-slate-800">{acSection} mm²</div></div>
                        <div className="text-right"><span className="block text-[8px] font-black text-slate-400 uppercase">Distance</span><div className="text-sm font-black text-slate-800">{project.distanceToPanel} M</div><div className="text-[7px] text-slate-400 font-bold italic">Coffret AC → point de raccordement</div></div>
                    </div>
                    <div className="h-px bg-slate-200"></div>
                    <div className="flex justify-between items-center">
                        <div>
                            <span className="block text-[8px] font-black text-slate-400 uppercase">Chute de Tension Calculée</span>
                            <div className={`text-xl font-black ${voltageDrop > 1 ? 'text-red-600' : 'text-green-600'}`}>{voltageDrop.toFixed(2)} %</div>
                        </div>
                    </div>
                </div>
                {/* FORMULE CHUTE DE TENSION */}
                <div className="mt-auto pt-3 border-t border-slate-200 font-mono text-[6.5px] text-slate-400 leading-[1.3]">
                    <span className="font-bold text-slate-500 block mb-0.5 uppercase tracking-tighter">Vérification Liaison :</span>
                    ΔU(%) = (b × L × I × ρ) / (U_reseau × S) × 100<br/>
                    Valeurs : ({isThreePhase ? '1.732' : '2'} × {project.distanceToPanel}m × {report?.details?.nominalAcCurrent}A × 0.023) / ({isThreePhase ? '400' : '230'} × {acSection}mm²)
                </div>
            </div>

        {microBranchesReport && microBranchesReport.branches?.length > 0 && (
          <section className="mb-8">
            <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2">Branches micro-onduleurs & chutes de tension (AC)</h3>
            <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 shadow-sm">
              <div className="text-[9px] text-slate-500 font-bold mb-2">
                Micros requis: {microBranchesReport.requiredMicros} • Micros configurés: {microBranchesReport.totalMicrosConfigured} • Puissance micro: {microBranchesReport.microPowerVA} VA
              </div>
              <div className="text-[8px] text-slate-500 mb-3">
                <b>L (m)</b> = longueur aller de la branche • <b>S (mm²)</b> = section conducteur • <b>I (A)</b> = courant de branche • <b>ΔU</b> = chute de tension
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <table className="w-full text-[9px]">
                  <thead className="bg-slate-100 text-slate-600 uppercase">
                    <tr>
                      <th className="p-2 text-left">Branche</th>
                      {project.inverterConfig.phase === 'Tri' && <th className="p-2 text-left">Phase</th>}
                      <th className="p-2 text-center"># Micros</th>
                      <th className="p-2 text-center">L (m)</th>
                      <th className="p-2 text-center">S (mm²)</th>
                      <th className="p-2 text-center">I (A)</th>
                      <th className="p-2 text-center">ΔU (V)</th>
                      <th className="p-2 text-center">ΔU (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {microBranchesReport.branches.map((b) => (
                      <tr key={b.branchId} className="border-t border-slate-100">
                        <td className="p-2 font-bold text-slate-700">{b.name}</td>
                        {project.inverterConfig.phase === 'Tri' && <td className="p-2">{b.phase}</td>}
                        <td className="p-2 text-center font-mono">{b.microCount}</td>
                        <td className="p-2 text-center font-mono">{b.cableLengthM}</td>
                        <td className="p-2 text-center font-mono">{b.cableSectionMm2}</td>
                        <td className="p-2 text-center font-mono">{b.currentA.toFixed(1)}</td>
                        <td className="p-2 text-center font-mono">{b.dropV.toFixed(1)}</td>
                        <td className={`p-2 text-center font-black ${b.dropPercent > 1 ? 'text-red-600' : 'text-green-700'}`}>{b.dropPercent.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 font-mono text-[6.5px] text-slate-400 leading-[1.3]">
                Hypothèses : U=230V (mono) / 400V (tri) • cuivre ρ=0.023 Ω·mm²/m • ΔU(V) = (2 × L × I × ρ) / S • ΔU(%) = ΔU/U×100
              </div>

              <div className="mt-3 text-[9px] text-slate-600 font-bold">
                Chute de tension « production » cumulée (pire branche + liaison tableau) : <span className={totalProductionDrop > 1 ? 'text-red-700' : 'text-green-700'}>{totalProductionDrop.toFixed(2)}%</span>
                <span className="text-slate-400"> (objectif ≤ 1% recommandé)</span>
              </div>
            </div>
          </section>
        )}
        </section>

        {/* --- TABLEAU DE SYNTHÈSE CONSUEL-READY --- */}
        <section className="flex-1">
            <div className="bg-slate-900 text-white rounded-3xl p-8 relative overflow-hidden shadow-2xl">
                <div className="absolute top-6 right-8 text-xs font-black uppercase tracking-[0.3em] opacity-20">Synthèse Administrative</div>
                <h3 className="text-xl font-black mb-6 uppercase tracking-tight flex items-center gap-3">
                    <span className="w-1.5 h-6 bg-orange-500"></span> Données "Consuel-ready"
                </h3>
                <div className="grid grid-cols-2 gap-x-12 gap-y-6">
                    <div className="space-y-4">
                        <div className="border-b border-slate-800 pb-2"><label className="block text-[8px] text-slate-500 font-black uppercase">Puissance PV totale installée</label><span className="text-lg font-bold">{totalPowerkWc} kWc</span></div>
                        <div className="border-b border-slate-800 pb-2"><label className="block text-[8px] text-slate-500 font-black uppercase">Puissance maximale de l'onduleur</label><span className="text-lg font-bold">{(report?.details?.maxAcPower / 1000).toFixed(2)} kVA</span></div>
                        <div className="border-b border-slate-800 pb-2"><label className="block text-[8px] text-slate-500 font-black uppercase">Tension de service DC max (Uoc_max)</label><span className="text-lg font-bold">{vocColdString} V</span></div>
                    </div>
                    <div className="space-y-4">
                        <div className="border-b border-slate-800 pb-2"><label className="block text-[8px] text-slate-500 font-black uppercase">Courant de court-circuit max corrigé (Isc x 1.25)</label><span className="text-lg font-bold">{report?.details?.iscCalculation} A</span></div>
                        <div className="border-b border-slate-800 pb-2"><label className="block text-[8px] text-slate-500 font-black uppercase">Intensité maximale AC par phase</label><span className="text-lg font-bold">{report?.details?.nominalAcCurrent} A</span></div>
                        <div className="border-b border-slate-800 pb-2"><label className="block text-[8px] text-slate-500 font-black uppercase">Protection de tête (Calibre disjoncteur)</label><span className="text-lg font-bold">{report?.details?.recommendedBreaker} A (Min.)</span></div>
                    </div>
                </div>
                <div className="mt-8 pt-6 border-t border-slate-800">
                    <p className="text-[10px] text-slate-400 leading-relaxed italic">
                        * Note technique : Cette synthèse facilite le remplissage des attestations de conformité (Dossiers Techniques SC 144A/B). 
                        Elle ne dispense pas l'installateur d'une vérification sur site des calibres et longueurs réelles.
                    </p>
                </div>
            </div>
        </section>

        <CommonFooter page={1 + (project.fields.length * 2) + (exportOptions.includeDatasheets ? 2 : 1)} />
      </div>

      <div className="pdf-page w-[210mm] h-[297mm] p-[15mm] flex flex-col bg-white">
        <CommonHeader title="Schéma électrique de principe" />
        <div className="flex-1 border border-slate-100 rounded-3xl overflow-hidden bg-white shadow-sm p-4 my-6">
            <ElectricalSchematic project={project} materials={materials} />
        </div>
        <CommonFooter page={1 + (project.fields.length * 2) + (exportOptions.includeDatasheets ? 2 : 1) + 1} />
      </div>

      {/* PAGES LISTE MATÉRIEL */}
      {materialChunks.map((chunk, pageIndex) => (
        <div key={pageIndex} className="pdf-page w-[210mm] h-[297mm] p-[15mm] flex flex-col bg-white text-left">
          <CommonHeader title={`Liste matériel globale ${materialPages > 1 ? `(${pageIndex + 1}/${materialPages})` : ''}`} />
          <div className="flex-1">
              <table className="w-full text-[11px] border-collapse">
                  <thead>
                      <tr className="bg-slate-800 text-white font-black text-[9px] tracking-widest uppercase">
                        <th className="p-4 text-left rounded-tl-xl">REF.</th>
                        <th className="p-4 text-left">DESCRIPTION</th>
                        <th className="p-4 text-center">QTE</th>
                        <th className="p-4 text-right rounded-tr-xl">CODE RICH.</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 border-x border-slate-100">
                      {chunk.map((row, idx) => {
                          if (row.type === 'header') {
                              return (
                                <tr key={`header-${row.title}`} className="bg-slate-200 border-y border-slate-300">
                                    <td colSpan={4} className="px-4 py-2 font-black text-slate-700 uppercase tracking-widest text-[10px]">
                                        {row.title}
                                    </td>
                                </tr>
                              );
                          }
                          if (row.type === 'subheader') {
                              return (
                                <tr key={`subheader-${row.title}`} className="bg-green-50 border-y border-green-100">
                                    <td colSpan={4} className="px-4 py-1.5 font-bold text-green-800 uppercase tracking-wide text-[9px]">
                                        {row.title}
                                    </td>
                                </tr>
                              );
                          }
                          if (row.type === 'warning') {
                              return (
                                <tr key={`warn-${idx}`} className="bg-red-50 border-b border-red-200">
                                    <td colSpan={4} className="p-2 text-[8px] font-bold text-red-600 text-center leading-tight">
                                        {row.text}
                                    </td>
                                </tr>
                              )
                          }
                          const m = row.material;
                          return (
                            <tr key={m.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-100'}>
                                <td className="p-4 font-black text-slate-800">{m.id}</td>
                                <td className="p-4">
                                    <div className="text-slate-500 font-medium">{m.description}</div>
                                </td>
                                <td className="p-4 text-center font-black text-slate-800 text-base">{m.quantity}</td>
                                <td className="p-4 text-right font-mono font-bold text-slate-400 text-[10px]">{m.price || '-'}</td>
                            </tr>
                          );
                      })}
                  </tbody>
              </table>
          </div>
          <CommonFooter page={totalPages - materialPages + pageIndex - (showDoc ? 2 : 0) - (showRegul ? 1 : 0)} />
        </div>
      ))}

      {/* Pages Documentation */}
      {showDoc && (
      <>
        <div className="pdf-page w-[210mm] h-[297mm] p-[15mm] flex flex-col bg-white text-left">
            <CommonHeader title="Documentation Technique - Structure & Modules" />
            <div className="grid grid-cols-2 gap-8 mt-4 flex-1 content-start">
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                   <h3 className="text-sm font-black text-slate-800 uppercase border-b-2 border-slate-800 pb-2 mb-4">
                      1. Structure {projectDocs.structure.brand}
                   </h3>
                   <div className="space-y-3">
                      {projectDocs.structure.manuals.map((url, i) => (
                          <DocLink key={i} title="Notice de Montage (PDF)" url={url} icon="🔧" />
                      ))}
                      {projectDocs.structure.videos.map((v, i) => (
                          <DocLink key={i} title={`Vidéo : ${v.title}`} url={v.url} icon="▶️" />
                      ))}
                   </div>
                </div>

                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                   <h3 className="text-sm font-black text-slate-800 uppercase border-b-2 border-slate-800 pb-2 mb-4">
                      2. Panneaux {projectDocs.panel.name}
                   </h3>
                   <div className="space-y-3">
                      <DocLink title="Fiche Technique (PDF)" url={projectDocs.panel.datasheet} />
                      <DocLink title="Manuel d'Installation (PDF)" url={projectDocs.panel.manual} icon="📖" />
                   </div>
                </div>
            </div>
            <CommonFooter page={totalPages - (showDoc ? 1 : 0) - (showRegul ? 1 : 0)} />
        </div>
        
        <div className="pdf-page w-[210mm] h-[297mm] p-[15mm] flex flex-col bg-white text-left">
            <CommonHeader title="Documentation Technique - Énergie & Administratif" />
            <div className="grid grid-cols-2 gap-8 mt-4 flex-1 content-start">
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                   <h3 className="text-sm font-black text-slate-800 uppercase border-b-2 border-slate-800 pb-2 mb-4">
                      3. Onduleur {projectDocs.inverter.brand}
                   </h3>
                   <div className="space-y-3">
                      <DocLink title="Fiche Technique" url={projectDocs.inverter.datasheet} />
                      <DocLink title="Manuel Utilisateur" url={projectDocs.inverter.manual} icon="📖" />
                      {projectDocs.inverter.foxCommissioningUrl && (
                          <DocLink title="Mise en service (Cloud)" url={projectDocs.inverter.foxCommissioningUrl} icon="☁️" />
                      )}
                   </div>
                </div>

                <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
                   <h3 className="text-sm font-black text-blue-900 uppercase border-b-2 border-blue-900 pb-2 mb-4">
                      4. Démarches & Consuel
                   </h3>
                   <div className="space-y-3">
                      <DocLink title="Portail CONSUEL (Demande en ligne)" url="https://www.consuel.com/" icon="🌐" />
                      <DocLink title="Dossier Technique SC 144A (Vente Surplus)" url="https://www.consuel.com/dossiers-techniques/" icon="📄" />
                      <DocLink title="Dossier Technique SC 144B (Autoconso Totale/Batterie)" url="https://www.consuel.com/dossiers-techniques/" icon="📄" />
                   </div>
                </div>
            </div>
            <CommonFooter page={totalPages - (showRegul ? 1 : 0)} />
        </div>
      </>
      )}

      {showRegul && (
        <div className="pdf-page w-[210mm] h-[297mm] p-[15mm] flex flex-col bg-white text-left">
            <CommonHeader title="Rappel et Règlementation" />
            <div className="mt-8 flex-1">
                <h2 className="text-3xl font-black text-slate-800 mb-2">Cadre Normatif</h2>
                <div className="bg-blue-50 border border-blue-200 rounded-3xl p-10 relative overflow-hidden shadow-sm">
                     <h3 className="text-xl font-black text-blue-900 mb-6 uppercase tracking-tight">Attestation de Conformité CONSUEL</h3>
                     <p className="text-sm text-blue-800 font-medium leading-relaxed mb-8 max-w-xl">
                        Pour toute installation de production d'énergie électrique (photovoltaïque) avec ou sans dispositif de 
                        stockage, la conformité aux normes en vigueur est obligatoire.
                     </p>
                     <a href="https://actualites.consuel.com/wp-content/uploads/2025/07/NL12-ART-AUTOCONSO-JUILLET25-v12.pdf" target="_blank" rel="noopener noreferrer" className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-black text-sm uppercase tracking-widest shadow-md transition-transform active:scale-95">
                         Consulter la note officielle
                     </a>
                </div>
            </div>
            <CommonFooter page={totalPages} />
        </div>
      )}
    </div>
  );
};

export default PdfReport;
