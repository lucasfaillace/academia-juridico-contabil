import { hash } from "bcryptjs";
const password = process.env.ADMIN_PASSWORD_INPUT || process.argv[2];
if (!password || password.length < 12) { console.error("Informe uma senha com pelo menos 12 caracteres."); process.exit(1); }
console.log(await hash(password, 12));
