/* TEST Auth "Invite user" template (saved 9:57 AM ET on Nov 9).
 * Taken from the message Auth itself sent at 15:03 UTC that day from
 * CLA Portal Live Test <testportal@clatitle.com>, subject
 * "You're invited to the CLA Title Portal". The confirmation link Auth
 * filled in is restored here as {{ .ConfirmationURL }}. inviteEmailContent
 * swaps that variable for the portal invite link. Nothing else is rewritten. */
export const AUTH_INVITE_SUBJECT = "You're invited to the CLA Title Portal";
export const AUTH_INVITE_LINK_VAR = '{{ .ConfirmationURL }}';
export const AUTH_INVITE_HTML = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>You're invited to the CLA Title Portal</title>

<style>
  body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; border-collapse:collapse; }
  img { -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; display:block; }
  a { text-decoration:none; }
  @media only screen and (max-width:620px) {
    .wrap { width:100% !important; max-width:100% !important; }
    .pad { padding-left:22px !important; padding-right:22px !important; }
    .h1 { font-size:24px !important; line-height:30px !important; }
    .portal-label { display:none !important; }
    .btn a { padding:16px 22px !important; font-size:16px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#eef6fb;">

<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
  You're invited to the CLA Title Portal — track your order, documents, tasks, and messages.&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;
</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#eef6fb" style="background-color:#eef6fb;">
  <tr>
    <td align="center" style="padding:28px 12px 36px;">
      
      <table role="presentation" class="wrap" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;margin:0 auto;">

        
        <tr>
          <td align="center" style="padding:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;line-height:16px;letter-spacing:0.08em;text-transform:uppercase;color:#7a93a8;">
            Test environment · not production
          </td>
        </tr>

        
        <tr>
          <td style="border-radius:18px;overflow:hidden;background-color:#ffffff;box-shadow:0 8px 28px rgba(11,42,69,0.10);">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">

              
              <tr>
                <td bgcolor="#0b2a45" class="pad" style="background-color:#0b2a45;background-image:linear-gradient(135deg,#0b2a45 0%,#123a5c 55%,#1a5f8c 100%);padding:28px 36px 24px;border-radius:18px 18px 0 0;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td align="left" valign="middle">
                        <img src="https://testportal.clatitle.com/assets/img/logo-white.png" width="176" height="50" alt="C.L.A. Title &amp; Escrow" style="width:176px;height:auto;max-width:176px;display:block;">
                      </td>
                      <td align="right" valign="middle" class="portal-label" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:16px;font-weight:600;letter-spacing:0.04em;color:#89cff0;white-space:nowrap;">
                        Title Portal
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              
              <tr>
                <td bgcolor="#89cff0" height="5" style="background-color:#89cff0;height:5px;font-size:0;line-height:0;">&nbsp;</td>
              </tr>

              
              <tr>
                <td class="pad" bgcolor="#ffffff" style="background-color:#ffffff;padding:34px 36px 8px;">
                  <p style="margin:0 0 10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:18px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#1f6fa3;">
                    Invitation
                  </p>
                  <h1 class="h1" style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:28px;line-height:34px;font-weight:700;letter-spacing:-0.02em;color:#0b2a45;">
                    You're invited to the CLA Title Portal
                  </h1>
                  <p style="margin:0 0 22px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:26px;color:#3d5568;">
                    C.L.A. Title &amp; Escrow has invited you to create an account. Once you accept, you can track your order, documents, tasks, and messages in one place.
                  </p>
                </td>
              </tr>

              
              <tr>
                <td class="pad" bgcolor="#ffffff" style="background-color:#ffffff;padding:0 28px 28px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f3fafe;border:1px solid #d7ebf7;border-radius:14px;">
                    <tr>
                      <td style="padding:14px 12px 6px;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                          <tr>
                            <td width="50%" valign="top" style="width:50%;padding:8px 8px;">
                              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;border:1px solid #e3f1fa;border-radius:12px;">
                                <tr>
                                  <td style="padding:14px 12px;" align="left">
                                    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                                      <td align="center" valign="middle" width="34" height="34" bgcolor="#89cff0" style="width:34px;height:34px;background-color:#89cff0;border-radius:9px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:34px;font-weight:800;color:#0b2a45;">O</td>
                                      <td style="padding-left:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:18px;font-weight:700;color:#0b2a45;">Orders</td>
                                    </tr></table>
                                  </td>
                                </tr>
                              </table>
                            </td>
                            <td width="50%" valign="top" style="width:50%;padding:8px 8px;">
                              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;border:1px solid #e3f1fa;border-radius:12px;">
                                <tr>
                                  <td style="padding:14px 12px;" align="left">
                                    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                                      <td align="center" valign="middle" width="34" height="34" bgcolor="#89cff0" style="width:34px;height:34px;background-color:#89cff0;border-radius:9px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:34px;font-weight:800;color:#0b2a45;">D</td>
                                      <td style="padding-left:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:18px;font-weight:700;color:#0b2a45;">Documents</td>
                                    </tr></table>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                          <tr>
                            <td width="50%" valign="top" style="width:50%;padding:8px 8px;">
                              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;border:1px solid #e3f1fa;border-radius:12px;">
                                <tr>
                                  <td style="padding:14px 12px;" align="left">
                                    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                                      <td align="center" valign="middle" width="34" height="34" bgcolor="#89cff0" style="width:34px;height:34px;background-color:#89cff0;border-radius:9px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:34px;font-weight:800;color:#0b2a45;">T</td>
                                      <td style="padding-left:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:18px;font-weight:700;color:#0b2a45;">Tasks</td>
                                    </tr></table>
                                  </td>
                                </tr>
                              </table>
                            </td>
                            <td width="50%" valign="top" style="width:50%;padding:8px 8px;">
                              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;border:1px solid #e3f1fa;border-radius:12px;">
                                <tr>
                                  <td style="padding:14px 12px;" align="left">
                                    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                                      <td align="center" valign="middle" width="34" height="34" bgcolor="#89cff0" style="width:34px;height:34px;background-color:#89cff0;border-radius:9px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:34px;font-weight:800;color:#0b2a45;">M</td>
                                      <td style="padding-left:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:18px;font-weight:700;color:#0b2a45;">Messages</td>
                                    </tr></table>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              
              <tr>
                <td class="pad" bgcolor="#ffffff" align="center" style="background-color:#ffffff;padding:0 36px 10px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="btn" style="margin:0 auto;">
                    <tr>
                      <td align="center" bgcolor="#0b2a45" style="background-color:#0b2a45;border-radius:12px;box-shadow:0 6px 16px rgba(11,42,69,0.22);">
                        
                        
                        <a href="{{ .ConfirmationURL }}" target="_blank" style="display:inline-block;padding:16px 34px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:17px;line-height:22px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;background-color:#0b2a45;border:1px solid #0b2a45;">
                          Accept invitation
                        </a>
                        
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              
              <tr>
                <td class="pad" bgcolor="#ffffff" style="background-color:#ffffff;padding:18px 36px 32px;border-radius:0 0 18px 18px;">
                  <p style="margin:0 0 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#7a93a8;">
                    Button not working? Copy and paste this link into your browser:
                  </p>
                  <p style="margin:0 0 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;word-break:break-all;">
                    <a href="{{ .ConfirmationURL }}" target="_blank" style="color:#1f6fa3;text-decoration:underline;">{{ .ConfirmationURL }}</a>
                  </p>
                  <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:#7a93a8;">
                    If you weren&rsquo;t expecting this, you can ignore this email.
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>

        
        <tr>
          <td align="center" class="pad" style="padding:22px 28px 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <p style="margin:0 0 4px;font-size:13px;line-height:18px;font-weight:700;color:#0b2a45;">C.L.A. Title &amp; Escrow</p>
            <p style="margin:0 0 4px;font-size:12px;line-height:18px;color:#7a93a8;">MD &middot; VA &middot; DC &middot; FL</p>
            <p style="margin:0 0 10px;font-size:12px;line-height:18px;">
              <a href="https://clatitle.com" target="_blank" style="color:#1f6fa3;text-decoration:underline;">clatitle.com</a>
            </p>
            <p style="margin:0;font-size:11px;line-height:16px;color:#9aabb8;">
              Sent from CLA Portal Live Test
            </p>
          </td>
        </tr>

      </table>
      
    </td>
  </tr>
</table>
</body>
</html>
`;
