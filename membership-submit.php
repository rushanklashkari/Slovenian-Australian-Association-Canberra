<?php
/*
 * Receives an online membership application from the website and emails it to the
 * Secretary with the completed membership form (PDF) attached.
 * Runs on the club's VentraIP (cPanel) hosting. Returns JSON {ok:true|false}.
 */
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

$TO   = 'secretary@slovenianclubcanberra.org.au';
$FROM = 'website@slovenianclubcanberra.org.au';

function out($ok, $code = 200, $msg = '') { http_response_code($code); echo json_encode(['ok' => $ok, 'error' => $msg]); exit; }
function clean($v, $max = 300) { $v = is_string($v) ? $v : ''; $v = str_replace(["\r", "\n", "\0"], ' ', $v); return trim(mb_substr($v, 0, $max)); }

if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(false, 405, 'POST only');

// Spam trap: real people never fill the hidden "website" field
if (!empty($_POST['website'])) out(true);

// Only accept submissions from our own pages
$ref = $_SERVER['HTTP_ORIGIN'] ?? ($_SERVER['HTTP_REFERER'] ?? '');
if ($ref !== '' && stripos($ref, 'slovenianclubcanberra.org.au') === false && stripos($ref, 'localhost') === false) out(false, 403, 'Bad origin');

$fields = [
  'application_kind' => 'Application', 'member_no' => 'Member / Badge No',
  'membership_type' => 'Type of membership',
  'surname' => 'Surname', 'first_name' => 'First name', 'other_names' => 'Other names',
  'title' => 'Title', 'title_other' => 'Title (other)',
  'street' => 'Street', 'suburb' => 'Suburb', 'city' => 'City', 'state' => 'State', 'postcode' => 'Postcode',
  'phone_home' => 'Phone home', 'phone_work' => 'Phone work', 'phone_mobile' => 'Phone mobile', 'email' => 'Email',
  'date_of_birth' => 'Date of birth', 'country_of_birth' => 'Country of birth',
  'parents_slovenian' => 'One or both parents Slovenian', 'grandparents_slovenian' => 'One or both grandparents Slovenian',
  'seconder1_name' => 'First seconder', 'seconder1_badge' => 'First seconder badge no', 'seconder1_years_known' => 'First seconder years known',
  'seconder2_name' => 'Second seconder', 'seconder2_badge' => 'Second seconder badge no', 'seconder2_years_known' => 'Second seconder years known',
  'declaration' => 'Declaration', 'signed_name' => 'Signed (typed)', 'date_signed' => 'Date',
];
$d = [];
foreach ($fields as $k => $label) $d[$k] = clean($_POST[$k] ?? '');

foreach (['membership_type', 'surname', 'first_name', 'street', 'phone_mobile', 'email', 'date_of_birth', 'signed_name'] as $req)
  if ($d[$req] === '') out(false, 422, 'Missing ' . $req);
if ($d['declaration'] === '') out(false, 422, 'Declaration not accepted');
$replyTo = filter_var($d['email'], FILTER_VALIDATE_EMAIL);
if (!$replyTo) out(false, 422, 'Invalid email');

// Optional PDF attachment (made in the visitor's browser from the official form)
$pdf = null;
if (!empty($_FILES['form_pdf']) && $_FILES['form_pdf']['error'] === UPLOAD_ERR_OK && $_FILES['form_pdf']['size'] > 0 && $_FILES['form_pdf']['size'] < 4 * 1024 * 1024) {
  $bytes = file_get_contents($_FILES['form_pdf']['tmp_name']);
  if (substr($bytes, 0, 5) === '%PDF-') $pdf = $bytes;
}

$name = trim($d['first_name'] . ' ' . $d['surname']);
$type = preg_replace('/\s*\(.*$/', '', $d['membership_type']);
$type = preg_replace('/\s+—.*$/u', '', $type);
$isRenew = ($d['application_kind'] === 'Renewal');
$subject = ($isRenew ? 'Membership renewal – ' : 'Membership application – ') . $name . ' (' . $type . ')';

$lines = [($isRenew ? "Membership renewal from the website." : "New membership application from the website."), ""];
foreach ($fields as $k => $label) if ($d[$k] !== '') $lines[] = str_pad($label . ':', 36) . $d[$k];
$lines[] = '';
$lines[] = $pdf ? ($isRenew ? 'The completed membership form (marked RENEWAL) is attached as a PDF.' : 'The completed membership form is attached as a PDF. Seconders still need to sign it.')
                : 'Note: the PDF could not be created in the applicant\'s browser — details are above.';
$lines[] = 'Reply to this email to contact the applicant.';
$text = implode("\r\n", $lines);

$boundary = 'saa_' . bin2hex(random_bytes(12));
$headers  = 'From: "Slovenian Club Canberra website" <' . $FROM . ">\r\n";
$headers .= 'Reply-To: ' . $replyTo . "\r\n";
$headers .= "MIME-Version: 1.0\r\n";
$headers .= 'Content-Type: multipart/mixed; boundary="' . $boundary . '"' . "\r\n";

$body  = "--$boundary\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n";
$body .= chunk_split(base64_encode($text)) . "\r\n";
if ($pdf) {
  $ascii = function_exists('iconv') ? (iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $name) ?: $name) : $name;
  $file = ($isRenew ? 'SAA-Membership-Renewal-' : 'SAA-Membership-Application-') . trim(preg_replace('/[^A-Za-z0-9]+/', '-', $ascii), '-') . '.pdf';
  $body .= "--$boundary\r\nContent-Type: application/pdf; name=\"$file\"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename=\"$file\"\r\n\r\n";
  $body .= chunk_split(base64_encode($pdf)) . "\r\n";
}
$body .= "--$boundary--\r\n";

$encSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
$sent = @mail($TO, $encSubject, $body, $headers, '-f' . $FROM);
if (!$sent) out(false, 500, 'Mail failed');
out(true);
