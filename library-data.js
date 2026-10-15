export const bookFields = [
  ["title", "Τίτλος"],
  ["author", "Συγγραφέας"],
  ["publisher", "Εκδόσεις"],
  ["publication_year", "Έτος έκδοσης"],
  ["publication_place", "Τόπος έκδοσης"],
  ["page_count", "Σελίδες"],
  ["catalog_number", "Αριθμός καταλόγου"],
  ["classification_code", "Ταξινομικός αριθμός"],
];
export const fieldLimits = [2000, 2000, 1000, 200, 500, 200, 200, 10000];
export const bookStatuses = {
  unverified: "Η διαθεσιμότητα δεν έχει επιβεβαιωθεί",
  unavailable: "Εκτός δανεισμού",
};

export function bookValues(record) {
  const values = Object.fromEntries(bookFields.map(([key]) => [key, String(record[key] ?? "").trim()]));
  values.status = record.status ?? "unverified";
  if (!values.title) throw new Error("Συμπληρώστε τον τίτλο του βιβλίου.");
  for (const [[key, label], limit] of bookFields.map((field, index) => [field, fieldLimits[index]])) {
    if (values[key].length > limit) throw new Error(`Το πεδίο «${label}» είναι πολύ μεγάλο (έως ${limit} χαρακτήρες).`);
  }
  if (!Object.hasOwn(bookStatuses, values.status)) throw new Error("Επιλέξτε έγκυρη κατάσταση βιβλίου.");
  return values;
}
