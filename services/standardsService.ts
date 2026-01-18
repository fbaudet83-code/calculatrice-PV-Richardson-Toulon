
import { RoofType, WindZone, Margins } from '../types';

/**
 * Calculates recommended safety margins based on French standards (DTU/Eurocodes).
 * Increases margins for high wind zones to protect against edge uplift (Zone S).
 */
export function getRecommendedMargins(roofType: RoofType, windZone: WindZone): Margins {
    let baseMargin = 300; // Minimum 30cm by default

    // Adjust based on Wind Zone (Zone de Rive - Edge Zone S)
    switch (windZone) {
        case WindZone.ZONE_1:
        case WindZone.ZONE_2:
            baseMargin = 300;
            break;
        case WindZone.ZONE_3:
            baseMargin = 400;
            break;
        case WindZone.ZONE_4:
            baseMargin = 500; // High wind requires larger edge distance
            break;
        case WindZone.ZONE_5:
            baseMargin = 600; // Extreme wind
            break;
    }

    // Adjust based on Roof Type (Physical constraints)
    let sideMargin = baseMargin;
    let topBottomMargin = baseMargin;

    switch (roofType) {
        case RoofType.TUILE_MECANIQUE:
        case RoofType.TUILE_PLATE:
            // Tiles often require aligning hooks with rafters which might not be exactly at the edge.
            // Keep standard calculated margin.
            break;
        case RoofType.TUILE_CANAL:
             // Canal tiles are often looser, require more care at edges.
             sideMargin += 50;
             break;
        case RoofType.FIBROCIMENT:
            // Corrugated sheets: Fixing must be on purlins.
            // Side overlap needs space.
            sideMargin += 100; 
            break;
    }

    return {
        top: topBottomMargin,
        bottom: topBottomMargin,
        left: sideMargin,
        right: sideMargin
    };
}
