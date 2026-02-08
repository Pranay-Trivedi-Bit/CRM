/**
 * CSM (Customer Success Manager) data for server-side use.
 * Maps CSM names to emails, and lead emails to assigned CSMs.
 */

// CSM name (lowercase) → their koenig-solutions.com email
const CSM_EMAIL_MAP = {
  "dheeraj kumar raosaheb patil": "Dheeraj.Patil@koenig-solutions.com",
  "kelly": "kelly@koenig-solutions.com",
  "rimpy srivastava": "rimpy.srivastava@koenig-solutions.com",
  "manish bansal": "manish.bansal@koenig-solutions.com",
  "nikita das": "Nikita.Das@koenig-solutions.com",
  "abhilakh borgohain": "Abhilakh.Borgohain@koenig-solutions.com",
  "divya r": "Divya.R@koenig-solutions.com",
  "rakesh kota amarnath": "Rakesh.K@koenig-solutions.com",
  "nirmala gowda c": "Nirmala.C@koenig-solutions.com",
  "khushi dhingra": "Khushi.Dhingra@koenig-solutions.com",
  "divyesh tiwari": "Divyesh.Tiwari@koenig-solutions.com",
  "akum jung la": "Akum.LA@koenig-solutions.com",
  "sana sadiq pathan": "Sana.Williams@koenig-solutions.com",
  "swati rai": "Swati.Rai@koenig-solutions.com",
  "saif hiyatullaha munshi": "Saif.Munshi@koenig-solutions.com",
  "aditya kumar tiwari": "Aditya.Tiwari@koenig-solutions.com",
  "kevin l": "Kevin.L@koenig-solutions.com",
  "parisha gupta": "Parisha.Gupta@koenig-solutions.com",
  "maitri dipak bhansali": "Maitri.Bhansali@koenig-solutions.com",
  "avni singh": "Avni.Singh@koenig-solutions.com",
  "zaid yousuf wani": "Zaid.Wani@koenig-solutions.com",
  "anchal bhatia": "Anchal.Bhatia@koenig-solutions.com",
  "saurabh banerjee": "saurabh.banerjee@koenig-solutions.com",
  "umar farooq": "Umar.Farooq@koenig-solutions.com",
  "tarun monga": "tarun.monga@koenig-solutions.com"
};

// Lead email (lowercase) → assigned CSM name
const CSM_MAP = {
  "2829016s@student.gla.ac.uk": "Manish Chaturvedi",
  "k.prahlad@nkindia.in": "Shikha Mishra",
  "suraj.k@zerodha.com": "Manish Chaturvedi",
  "siddhesh-sanjay.ghag@capgemini.com": "Gurpreet Kaur",
  "varalakshmi.donaparthi@skillquotientgroup.com": "Shikha Mishra",
  "dhairyavyas@live.com": "Manish Chaturvedi",
  "dashnamurthy@grundfos.com": "Shikha Mishra",
  "gautamjyotichutia@gmail.com": "Manish Chaturvedi",
  "mahek.mehta@madhda.com": "Gurpreet Singh",
  "titiksha.kulshrestha@hsbc.co.in": "ALWIN PB",
  "kumari.singh2@bankofbaroda.com": "Kuldip Singh Parmar",
  "kushal.kumarsingh@jll.com": "Mohsin Afzal Bhat",
  "saravanan.gunasekaran@v11tech.com": "Shikha Mishra",
  "prem.chand@torquepharma.com": "Shikha Mishra",
  "rishi.raj@vertiv.com": "Shikha Mishra",
  "vipin.verma@nuvoco.com": "Shaik Sumaya Parvin",
  "sweta.p1811@connect.com": "Umar Farooq",
  "bipindaftardarvf@mitwpu.edu.in": "Rakesh Kota Amarnath",
  "dharmendra@gtrtek.com": "Neha Tripathi",
  "avinash.prasad@pwc.com": "Shiv Sompati"
};

/**
 * Resolve the CSM email for a given lead.
 * @param {string} leadEmail - The lead's email address
 * @param {string} assignedTo - The CSM name assigned to this lead (from localStorage/dashboard)
 * @returns {{ csmName: string, csmEmail: string } | null}
 */
function resolveCsmForLead(leadEmail, assignedTo) {
  // First try the assignedTo name from lead data
  if (assignedTo) {
    const csmEmail = CSM_EMAIL_MAP[assignedTo.toLowerCase()];
    if (csmEmail) {
      return { csmName: assignedTo, csmEmail };
    }
  }

  // Fallback: look up by lead email in CSM_MAP
  if (leadEmail) {
    const csmName = CSM_MAP[leadEmail.toLowerCase()];
    if (csmName) {
      const csmEmail = CSM_EMAIL_MAP[csmName.toLowerCase()];
      if (csmEmail) {
        return { csmName, csmEmail };
      }
      // CSM name exists but no email mapping
      return { csmName, csmEmail: null };
    }
  }

  return null;
}

/**
 * Get all CSMs with their emails
 */
function getAllCsms() {
  return Object.entries(CSM_EMAIL_MAP).map(([name, email]) => ({
    name: name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
    email
  }));
}

module.exports = { CSM_EMAIL_MAP, CSM_MAP, resolveCsmForLead, getAllCsms };
