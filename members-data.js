export const memberFields = [
  ["member_code", "Κωδικός μέλους", 20],
  ["surname", "Επώνυμο / ονοματεπώνυμο (όπως στο αρχείο)", 300],
  ["given_name", "Όνομα (όπως στο αρχείο)", 300],
];

export function memberValues(record) {
  const values = {};
  for (const [key, label, limit] of memberFields) {
    const value = record[key] ?? "";
    if (typeof value !== "string" || value.trim().length > limit) {
      throw new Error(`Ελέγξτε το πεδίο «${label}» (έως ${limit} χαρακτήρες).`);
    }
    values[key] = value.trim();
  }
  if (!/^[0-9]{1,20}$/.test(values.member_code)) throw new Error("Γράψτε έναν κωδικό μέλους μόνο με αριθμούς, έως 20 ψηφία.");
  return values;
}

export function needsMemberReview(record) {
  return !record.surname.trim() || /^[0-9]+$/.test(record.given_name.trim());
}

export function memberError(error) {
  if (error.code === "23505") return "Ο κωδικός αυτός ανήκει ήδη σε άλλο μέλος. Επιλέξτε διαφορετικό κωδικό ή επεξεργαστείτε την υπάρχουσα εγγραφή.";
  if (error.code === "40001") return "Η εγγραφή άλλαξε ή διαγράφηκε από άλλο διαχειριστή. Κρατήστε τις διορθώσεις σας και φορτώστε ξανά τη λίστα πριν δοκιμάσετε ξανά.";
  if (error.code === "42501" || error.status === 401 || error.status === 403) return "Δεν έχετε πρόσβαση στο μητρώο ή η σύνδεσή σας έληξε. Συνδεθείτε ξανά ως διαχειριστής.";
  return "Δεν ολοκληρώθηκε η ενέργεια στα μέλη. Ελέγξτε τη σύνδεσή σας και δοκιμάστε ξανά. Οι αλλαγές δεν επιβεβαιώθηκαν· ανανεώστε τη λίστα για έλεγχο πριν τις επαναλάβετε.";
}
