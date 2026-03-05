export type StationSearchEntry = {
  crs: string;
  name: string;
  aliases?: string[];
};

export const stationsUk: StationSearchEntry[] = [
  { crs: "SEV", name: "Sevenoaks" },
  { crs: "TON", name: "Tonbridge" },
  { crs: "LBG", name: "London Bridge", aliases: ["London Br"] },
  { crs: "CHX", name: "London Charing Cross", aliases: ["Charing Cross"] },
  { crs: "CST", name: "London Cannon Street", aliases: ["Cannon Street"] },
  { crs: "VIC", name: "London Victoria" },
  { crs: "WAT", name: "London Waterloo" },
  { crs: "LST", name: "London Liverpool Street", aliases: ["Liverpool Street"] },
  { crs: "PAD", name: "London Paddington" },
  { crs: "KGX", name: "London Kings Cross", aliases: ["King's Cross", "Kings Cross"] },
  { crs: "EUS", name: "London Euston" },
  { crs: "STP", name: "London St Pancras International", aliases: ["St Pancras"] },
  { crs: "CLJ", name: "Clapham Junction" },
  { crs: "GTW", name: "Gatwick Airport", aliases: ["Gatwick"] },
  { crs: "LGW", name: "Gatwick Airport", aliases: ["Gatwick"] },
  { crs: "BSK", name: "Basingstoke" },
  { crs: "RDG", name: "Reading" },
  { crs: "BTN", name: "Brighton" },
  { crs: "MAI", name: "Maidenhead" },
  { crs: "SLO", name: "Slough" },
  { crs: "WOK", name: "Woking" },
  { crs: "GLC", name: "Glasgow Central" },
  { crs: "EDB", name: "Edinburgh" },
  { crs: "MAN", name: "Manchester Piccadilly", aliases: ["Manchester"] },
  { crs: "LDS", name: "Leeds" },
  { crs: "BHM", name: "Birmingham New Street", aliases: ["Birmingham"] },
  { crs: "NCL", name: "Newcastle" },
  { crs: "YRK", name: "York" },
  { crs: "BRI", name: "Bristol Temple Meads", aliases: ["Bristol"] },
  { crs: "CDF", name: "Cardiff Central", aliases: ["Cardiff"] },
];
