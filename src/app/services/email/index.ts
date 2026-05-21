export {
  sendTransactionalMail,
  isEmailConfigured,
} from "./smtp.service";
export { assertEmailConfigured, sendInvoiceEmail } from "./invoiceMail.service";
export type { SendMailInput } from "./smtp.service";
