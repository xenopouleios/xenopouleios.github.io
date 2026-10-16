export const applicationFields = [
  ["full_name", "Ονοματεπώνυμο μέλους", 300, "text"],
  ["guardian_name", "Όνομα γονέα (για ανήλικο μέλος)", 300, "text"],
  ["phone", "Τηλέφωνο επικοινωνίας", 50, "tel"],
  ["email", "Email", 254, "email"],
  ["address", "Διεύθυνση", 500, "text"],
  ["identity_number", "Αρ. Ταυτότητας (ή διαβατηρίου)", 100, "text"],
];

export function applicationValues(form) {
  const values = { is_minor: form.is_minor === true };
  for (const [key, label, limit] of applicationFields) {
    values[key] = String(form[key] ?? "").trim();
    if ((!values[key] && (key !== "guardian_name" || values.is_minor)) || values[key].length > limit) {
      throw new Error(`Συμπληρώστε σωστά το πεδίο «${label}» (έως ${limit} χαρακτήρες).`);
    }
  }
  values.email = values.email.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) throw new Error("Συμπληρώστε έγκυρο email.");
  for (const [key, min] of [["full_name", 2], ["phone", 5], ["address", 3], ["identity_number", 3]]) {
    if (values[key].length < min) throw new Error("Ελέγξτε ότι τα στοιχεία της αίτησης είναι πλήρη.");
  }
  if (values.is_minor && values.guardian_name.length < 2) throw new Error("Για ανήλικο μέλος χρειάζεται το όνομα γονέα.");
  return values;
}

export function lendingError(error) {
  if (error.code === "42501" || error.status === 401 || error.status === 403) return "Χρειάζεται σύνδεση με εγκεκριμένο λογαριασμό και τα κατάλληλα δικαιώματα.";
  if (error.code === "40001" || error.code === "23505") return "Η κατάσταση άλλαξε ή η εγγραφή υπάρχει ήδη. Ανανεώστε τη λίστα πριν δοκιμάσετε ξανά.";
  if (error.code === "23514") return "Ελέγξτε τα πεδία. Η ένδειξη «Δανεισμένο» αλλάζει μόνο με καταχώριση δανεισμού ή επιστροφής.";
  if (error.code === "23503") return "Η εγγραφή συνδέεται με αίτηση ή δανεισμό και δεν μπορεί να διαγραφεί.";
  if (error.code === "54000" || error.status === 429) return "Συμπληρώθηκε το όριο αιτημάτων. Δοκιμάστε αργότερα ή επικοινωνήστε με τη βιβλιοθήκη.";
  if (error.code === "invalid_credentials") return "Το email ή ο κωδικός δεν είναι σωστά.";
  if (error.code === "22023") return "Ελέγξτε τα στοιχεία και τον αριθμό μητρώου. Η εγγραφή μπορεί να μην είναι διαθέσιμη για αυτή την ενέργεια.";
  return "Η ενέργεια δεν ολοκληρώθηκε. Ελέγξτε τη σύνδεσή σας και δοκιμάστε ξανά. Αν συνεχίζεται, ενημερώστε τη βιβλιοθήκη.";
}

export function approvalEmail({ full_name, member_code, activation_url }) {
  return `Αγαπητέ/ή ${full_name},\n\nΗ εγγραφή σας στο Ξενοπούλειο εγκρίθηκε.\nΑριθμός μητρώου μέλους: ${member_code}\n\nΟρίστε τον προσωπικό σας κωδικό από τον παρακάτω σύνδεσμο:\n${activation_url}\n\nΟ σύνδεσμος είναι προσωπικός, μίας χρήσης και έχει περιορισμένη διάρκεια. Μην τον κοινοποιήσετε. Αν έχει λήξει, ζητήστε νέο από τη βιβλιοθήκη.\n\nΣύνδεση μέλους: https://xenopouleios.github.io/daneistiki.html\nΧρησιμοποιήστε το email σας και τον προσωπικό σας κωδικό. Ο αριθμός μητρώου δεν είναι κωδικός πρόσβασης.\n\nΞενοπούλειος Παιδική Βιβλιοθήκη`;
}
