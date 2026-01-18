
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Material, Project, CompatibilityReport } from '../types';
import { PdfIcon, SpinnerIcon, XIcon } from './icons';
import PdfReport from './PdfReport';
import { groupMaterialsByCategory } from '../services/calculatorService';
import type { MicroBranchesReport } from '../services/microBranchService';

declare global {
  interface Window {
    jspdf: any;
    html2canvas: any;
  }
}

const scriptLoadPromises: { [src: string]: Promise<void> } = {};

const loadScript = (src: string): Promise<void> => {
  if (scriptLoadPromises[src]) return scriptLoadPromises[src];
  scriptLoadPromises[src] = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      delete scriptLoadPromises[src];
      reject(new Error(`Le script ${src} n'a pas pu être chargé.`));
    };
    document.head.appendChild(script);
  });
  return scriptLoadPromises[src];
};

const ensurePdfLibraries = async () => {
  if (typeof window.html2canvas === 'function' && typeof window.jspdf !== 'undefined') return;
  try {
    await Promise.all([
      loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'),
      loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'),
    ]);
    let attempts = 0;
    while ((typeof window.html2canvas !== 'function' || typeof window.jspdf === 'undefined') && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
  } catch (error) {
    throw new Error("Les librairies PDF n'ont pas pu être chargées.");
  }
};

interface BillOfMaterialsProps {
  materials: Material[];
  project: Project;
  onUpdate: (materials: Material[]) => void;
  report: CompatibilityReport | null;
  voltageDrop: number;
  acSection: number;
  microBranchesReport?: MicroBranchesReport | null;
}

const BillOfMaterials: React.FC<BillOfMaterialsProps> = ({ materials, project, onUpdate, report, voltageDrop, acSection, microBranchesReport }) => {
  const [localMaterials, setLocalMaterials] = useState<Material[]>(materials);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState('Exporter en PDF');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportOptions, setExportOptions] = useState({
      includeDatasheets: true,
      includeGuides: true,
      includeRegulations: true
  });

  useEffect(() => { setLocalMaterials(materials); }, [materials]);

  const handlePriceChange = (id: string, price: string) => {
    const updated = localMaterials.map(m => m.id === id ? { ...m, price } : m);
    setLocalMaterials(updated);
    onUpdate(updated);
  };

  const groupedMaterials = useMemo(() => groupMaterialsByCategory(localMaterials), [localMaterials]);

  const handleExportPDF = useCallback(async () => {
    if (isExporting) return;
    const reportElementSource = document.getElementById('pdf-report-source');
    if (!reportElementSource) return;

    setIsExporting(true);
    setExportStatus('Préparation...');

    const currentScrollY = window.scrollY;
    window.scrollTo(0, 0);

    const reportElement = reportElementSource.cloneNode(true) as HTMLElement;
    reportElement.id = 'pdf-report-clone';
    reportElement.classList.remove('hidden');
    reportElement.style.display = 'block';
    reportElement.style.position = 'absolute';
    reportElement.style.left = '-10000px';
    reportElement.style.top = '0';
    reportElement.style.width = '210mm'; 
    document.body.appendChild(reportElement);

    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
      await ensurePdfLibraries();
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const pageElements = reportElement.querySelectorAll('.pdf-page');

      for (let i = 0; i < pageElements.length; i++) {
        setExportStatus(`Génération Page ${i + 1}/${pageElements.length}...`);
        const pageElement = pageElements[i] as HTMLElement;
        
        const canvas = await window.html2canvas(pageElement, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          scrollY: 0,
        });

        if (i > 0) pdf.addPage();
        const imgData = canvas.toDataURL('image/jpeg', 0.90);
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);

        const pageRect = pageElement.getBoundingClientRect();
        const pxToMmWidth = pdfWidth / pageRect.width;
        const pxToMmHeight = pdfHeight / pageRect.height;

        const links = pageElement.querySelectorAll('a');
        links.forEach((link) => {
            const url = link.getAttribute('href');
            if (url && url !== '#' && url.startsWith('http')) {
                const linkRect = link.getBoundingClientRect();
                const x = (linkRect.left - pageRect.left) * pxToMmWidth;
                const y = (linkRect.top - pageRect.top) * pxToMmHeight;
                const w = linkRect.width * pxToMmWidth;
                const h = linkRect.height * pxToMmHeight;
                pdf.link(x, y, w, h, { url: url });
            }
        });
      }

      pdf.save(`Dossier_Technique_${project.name.replace(/\s/g, '_') || 'Solaire'}.pdf`);
    } catch (error) {
      console.error("Erreur d'export PDF:", error);
      alert("Une erreur est survenue lors de la génération du PDF interactif.");
    } finally {
      document.getElementById('pdf-report-clone')?.remove();
      window.scrollTo(0, currentScrollY);
      setIsExporting(false);
      setExportStatus('Exporter en PDF');
    }
  }, [project, isExporting]);

  const isCompatible = report?.isCompatible ?? false;

  const renderItemRow = (item: Material, idx: number) => (
      <React.Fragment key={item.id}>
          <tr className={`border-b border-slate-100 hover:bg-slate-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-100'}`}>
              <td className="px-6 py-2 font-medium text-slate-900">
                  {item.datasheetUrl ? (
                      <a href={item.datasheetUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline hover:text-blue-800 transition-colors flex items-center gap-1 group" title="Voir la fiche technique">
                          {item.id}
                          <span className="opacity-0 group-hover:opacity-100 text-[10px]">↗</span>
                      </a>
                  ) : (
                      item.id
                  )}
              </td>
              <td className="px-6 py-2">
                  {item.datasheetUrl ? (
                      <a href={item.datasheetUrl} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 hover:underline block transition-colors" title="Voir la fiche technique">
                          {item.description}
                      </a>
                  ) : (
                      <div>{item.description}</div>
                  )}
                  {item.description.toLowerCase().includes('coffret ac') && (!project.inverterConfig.agcpValue || project.inverterConfig.agcpValue <= 0) && (
                      <div className="text-[10px] text-red-600 font-bold mt-1 italic leading-tight">
                          Disjoncteur non livré dans les coffrets AC à calibrer et a ajouter en fonction de l'AGCP client
                      </div>
                  )}
              </td>
              <td className="px-6 py-2 text-center font-bold text-slate-700">{item.quantity}</td>
              <td className="px-6 py-2 text-right">
                  <input type="text" value={item.price || ''} onChange={(e) => handlePriceChange(item.id, e.target.value)} className="w-24 text-right p-1 border border-slate-300 rounded bg-white/50 focus:bg-white" />
              </td>
          </tr>
          {item.id === 'FOX-MICRO-1000' && (
              <tr className="bg-red-50 border-b border-red-100">
                  <td colSpan={4} className="px-6 py-3 text-[11px] text-red-600 font-bold leading-tight">
                      ⚠️ Ce qu’il faut aussi prendre en compte<br/>
                      Jusqu’à 7 micro-onduleurs sur un câble équivalent 6 mm² avec un disjoncteur jusqu’à 32 A .👉 Ces limites tiennent compte de la capacité de transport de courant du câble et des jonctions.
                      Merci de vous reporter a la fiche technique constructeur
                  </td>
              </tr>
          )}
          {item.id === 'ENP-IQ8MC-72-M-INT' && (
              <tr className="bg-red-50 border-b border-red-100">
                  <td colSpan={4} className="px-6 py-3 text-[11px] text-red-600 font-bold leading-tight">
                      ⚠️ Ce qu’il faut aussi prendre en compte (IQ8MC)<br/>
                      Disjoncteur 20 A monophasé : nombre max ~11 par branche (Câble 2.5mm²).<br/>
                      👉 Ces limites recommandées par Enphase tiennent compte de la chute de tension et du courant admissible du câble AC.
                      <br/>Merci de vous reporter a la fiche technique constructeur
                  </td>
              </tr>
          )}
          {item.id === 'ENP-IQ8HC-72-M-INT' && (
              <tr className="bg-red-50 border-b border-red-100">
                  <td colSpan={4} className="px-6 py-3 text-[11px] text-red-600 font-bold leading-tight">
                      ⚠️ Ce qu’il faut aussi prendre en compte (IQ8HC)<br/>
                      Disjoncteur 20 A monophasé : nombre max ~9 par branche (Câble 2.5mm²).<br/>
                      👉 Ces limites recommandées par Enphase tiennent compte de la chute de tension et du courant admissible du câble AC.
                      <br/>Merci de vous reporter a la fiche technique constructeur
                  </td>
              </tr>
          )}
          {item.id === 'ENP-IQ8P-72-2-INT' && (
              <tr className="bg-red-50 border-b border-red-100">
                  <td colSpan={4} className="px-6 py-3 text-[11px] text-red-600 font-bold leading-tight">
                      ⚠️ Ce qu’il faut aussi prendre en compte (IQ8P)<br/>
                      Disjoncteur 20 A monophasé : nombre max ~7-8 par branche (Câble 2.5mm²).<br/>
                      👉 Ces limites recommandées par Enphase tiennent compte de la chute de tension et du courant admissible du câble AC.
                      <br/>Merci de vous reporter a la fiche technique constructeur
                  </td>
              </tr>
          )}
          {item.id === 'APS-DS3' && (
              <tr className="bg-red-50 border-b border-red-100">
                  <td colSpan={4} className="px-6 py-3 text-[11px] text-red-600 font-bold leading-tight">
                      ⚠️ Ce qu’il faut aussi prendre en compte (DS3)<br/>
                      Câble AC bus 2.5mm² (Max ~20A) : 5 unités max par branche.<br/>
                      👉 Ces limites tiennent compte de la capacité du câble bus et des chutes de tension.
                      <br/>Merci de vous reporter a la fiche technique constructeur
                  </td>
              </tr>
          )}
          {item.id === 'APS-DS3-H' && (
              <tr className="bg-red-50 border-b border-red-100">
                  <td colSpan={4} className="px-6 py-3 text-[11px] text-red-600 font-bold leading-tight">
                      ⚠️ Ce qu’il faut aussi prendre en compte (DS3-H)<br/>
                      Câble AC bus 2.5mm² (Max ~20A) : 4 à 5 unités max par branche.<br/>
                      👉 Ces limites tiennent compte de la capacité du câble bus et des chutes de tension.
                      <br/>Merci de vous reporter a la fiche technique constructeur
                  </td>
              </tr>
          )}
      </React.Fragment>
  );

  return (
    <div className="bg-white p-4 rounded-lg shadow-md relative">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-slate-700">Liste de Matériel Globale</h3>
        <div className="flex flex-col items-end gap-1">
            <button 
                onClick={() => setShowExportModal(true)} 
                disabled={isExporting || !isCompatible}
                className="flex items-center justify-center gap-2 w-[180px] bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm disabled:bg-slate-300 disabled:cursor-not-allowed"
            >
                {isExporting ? <SpinnerIcon className="h-5 w-5 animate-spin" /> : <PdfIcon className="h-5 w-5" />}
                <span>{isExporting ? exportStatus : 'Exporter en PDF'}</span>
            </button>
            {!isCompatible && (
                <span className="text-[10px] font-bold text-red-500 uppercase bg-red-50 px-2 py-1 rounded">
                    ⚠️ Export bloqué : Configuration non conforme
                </span>
            )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-slate-500">
          <thead className="text-xs text-slate-700 uppercase bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-3">Réf. Fabricant</th>
              <th className="px-6 py-3">Description</th>
              <th className="px-6 py-3 text-center">Qté</th>
              <th className="px-6 py-3 text-right">Code Rich.</th>
            </tr>
          </thead>
          <tbody>
            {groupedMaterials.map((group) => (
                <React.Fragment key={group.category}>
                    <tr className="bg-slate-200 border-y border-slate-300">
                        <td colSpan={4} className="px-6 py-2 font-black text-slate-700 uppercase tracking-widest text-xs">
                            {group.category}
                        </td>
                    </tr>
                    {group.items.map((item, idx) => renderItemRow(item, idx))}
                    {group.subSections?.map(sub => (
                        <React.Fragment key={sub.title}>
                            <tr className="bg-green-50 border-y border-green-100">
                                <td colSpan={4} className="px-6 py-1.5 font-bold text-green-800 uppercase tracking-wide text-[10px]">
                                    {sub.title}
                                </td>
                            </tr>
                            {sub.items.map((item, idx) => renderItemRow(item, idx))}
                        </React.Fragment>
                    ))}
                </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      
      <PdfReport 
        project={project} 
        materials={localMaterials} 
        exportOptions={exportOptions} 
        report={report} 
        voltageDrop={voltageDrop} 
        acSection={acSection} 
        microBranchesReport={microBranchesReport}
      />

      {showExportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2">Génération du Dossier Technique</h3>
                  <div className="space-y-4 mb-6">
                      <p className="text-sm text-slate-600">Le document comportera les plans de pose, les calculs de conformité, le schéma électrique et les <b>liens interactifs</b> vers les notices.</p>
                      
                      <div className="bg-slate-50 p-4 rounded-lg space-y-3">
                          <label className="flex items-center gap-3 cursor-pointer">
                              <input type="checkbox" className="w-4 h-4 text-blue-600 rounded" checked={exportOptions.includeDatasheets} onChange={() => setExportOptions(o => ({...o, includeDatasheets: !o.includeDatasheets}))} />
                              <span className="text-sm font-medium text-slate-800">Inclure l'audit électrique détaillé</span>
                          </label>
                          <label className="flex items-center gap-3 cursor-pointer">
                              <input type="checkbox" className="w-4 h-4 text-blue-600 rounded" checked={exportOptions.includeGuides} onChange={() => setExportOptions(o => ({...o, includeGuides: !o.includeGuides}))} />
                              <span className="text-sm font-medium text-slate-800">Inclure la documentation technique (liens & notices)</span>
                          </label>
                          <label className="flex items-center gap-3 cursor-pointer">
                              <input type="checkbox" className="w-4 h-4 text-blue-600 rounded" checked={exportOptions.includeRegulations} onChange={() => setExportOptions(o => ({...o, includeRegulations: !o.includeRegulations}))} />
                              <span className="text-sm font-medium text-slate-800">Ajouter la page "Rappel et Règlementation"</span>
                          </label>
                      </div>
                  </div>
                  <div className="flex gap-3">
                      <button onClick={() => setShowExportModal(false)} className="flex-1 py-2.5 bg-slate-100 rounded-lg font-bold text-slate-600">Annuler</button>
                      <button onClick={() => { setShowExportModal(false); handleExportPDF(); }} className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-bold shadow-lg shadow-blue-200">Générer le PDF</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default BillOfMaterials;
