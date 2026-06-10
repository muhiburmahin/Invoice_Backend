export {
  sendTransactionalMail,
  isEmailConfigured,
} from "./smtp.service";
export { assertEmailConfigured, sendInvoiceEmail } from "./invoiceMail.service";
export {
  buildResetPasswordEmailContent,
  buildVerifyEmailContent,
} from "./transactionalMail.templates";
export type { SendMailInput } from "./smtp.service";
