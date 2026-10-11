SET session_replication_role = replica;

--
-- PostgreSQL database dump
--

-- \restrict JkjH3AcGdoKniRn0DlruvEGdP7yRYzIncfohiR0AZXJ4UrHSkaB3ywo3rhw5NTj

-- Dumped from database version 17.11
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: audit_log_entries; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: custom_oauth_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: flow_state; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."users" ("instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at", "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token", "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at", "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin", "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change", "phone_change_token", "phone_change_sent_at", "email_change_token_current", "email_change_confirm_status", "banned_until", "reauthentication_token", "reauthentication_sent_at", "is_sso_user", "deleted_at", "is_anonymous") VALUES
	('00000000-0000-0000-0000-000000000000', 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 'authenticated', 'authenticated', 'vale-pending@placeholder.invalid', '', NULL, NULL, '', NULL, '', NULL, '', '', NULL, NULL, '{"provider": "email", "providers": ["email"]}', '{"username": "vale-pending"}', NULL, '2026-10-11 21:53:19.906916+00', '2026-10-11 21:53:19.906916+00', NULL, NULL, '', '', NULL, '', 0, 'infinity', '', NULL, false, NULL, false),
	('00000000-0000-0000-0000-000000000000', '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'authenticated', 'authenticated', 'franci.malaspina@gmail.com', '$2a$10$RDsSS2o665RUnPVWkeEVkeua81DkuF92Sq6HogUfkCFTYZUixe27q', '2026-10-11 21:06:11.483386+00', NULL, '', '2026-10-11 21:05:54.785718+00', '', NULL, '', '', NULL, '2026-10-11 21:49:07.106415+00', '{"provider": "email", "providers": ["email"]}', '{"sub": "6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87", "email": "franci.malaspina@gmail.com", "username": "FraM", "email_verified": true, "phone_verified": false}', NULL, '2026-10-11 21:05:54.739885+00', '2026-10-11 22:06:18.30257+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false);


--
-- Data for Name: identities; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."identities" ("provider_id", "user_id", "identity_data", "provider", "last_sign_in_at", "created_at", "updated_at", "id") VALUES
	('6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', '{"sub": "6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87", "email": "franci.malaspina@gmail.com", "username": "FraM", "email_verified": true, "phone_verified": false}', 'email', '2026-10-11 21:05:54.776269+00', '2026-10-11 21:05:54.776319+00', '2026-10-11 21:05:54.776319+00', 'f5b65040-30ed-4d34-8337-37905816f2da');


--
-- Data for Name: instances; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_clients; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: sessions; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."sessions" ("id", "user_id", "created_at", "updated_at", "factor_id", "aal", "not_after", "refreshed_at", "user_agent", "ip", "tag", "oauth_client_id", "refresh_token_hmac_key", "refresh_token_counter", "scopes") VALUES
	('2e096169-2ab7-41ef-8d27-b75071e873e3', '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', '2026-10-11 21:06:11.488918+00', '2026-10-11 21:06:11.488918+00', NULL, 'aal1', NULL, NULL, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:157.0) Gecko/20100101 Firefox/157.0', '93.44.203.118', NULL, NULL, NULL, NULL, NULL),
	('f5e75fa7-5c85-475a-bb61-885bc2b0da35', '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', '2026-10-11 21:49:07.106965+00', '2026-10-11 21:49:07.106965+00', NULL, 'aal1', NULL, NULL, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:157.0) Gecko/20100101 Firefox/157.0', '93.44.203.118', NULL, NULL, NULL, NULL, NULL),
	('38498ebb-09a4-4685-b68a-e6dec3e6c77d', '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', '2026-10-11 21:08:17.977574+00', '2026-10-11 22:06:18.318029+00', NULL, 'aal1', NULL, '2026-10-11 22:06:18.317905', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:157.0) Gecko/20100101 Firefox/157.0', '93.44.203.118', NULL, NULL, NULL, NULL, NULL);


--
-- Data for Name: mfa_amr_claims; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."mfa_amr_claims" ("session_id", "created_at", "updated_at", "authentication_method", "id") VALUES
	('2e096169-2ab7-41ef-8d27-b75071e873e3', '2026-10-11 21:06:11.501244+00', '2026-10-11 21:06:11.501244+00', 'otp', '6d7f7285-0d97-4c45-99d5-c60e3871b260'),
	('38498ebb-09a4-4685-b68a-e6dec3e6c77d', '2026-10-11 21:08:18.000978+00', '2026-10-11 21:08:18.000978+00', 'password', '09820752-a354-47b4-bcc1-9ffb6530da07'),
	('f5e75fa7-5c85-475a-bb61-885bc2b0da35', '2026-10-11 21:49:07.133559+00', '2026-10-11 21:49:07.133559+00', 'password', 'be291779-2c1f-4e6b-b159-f24e65a99721');


--
-- Data for Name: mfa_factors; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: mfa_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: mfa_recovery_code_sets; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: mfa_recovery_codes; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_authorizations; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_client_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_consents; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: one_time_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."refresh_tokens" ("instance_id", "id", "token", "user_id", "revoked", "created_at", "updated_at", "parent", "session_id") VALUES
	('00000000-0000-0000-0000-000000000000', 1, '7ad4hhi5jnau', '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', false, '2026-10-11 21:06:11.493581+00', '2026-10-11 21:06:11.493581+00', NULL, '2e096169-2ab7-41ef-8d27-b75071e873e3'),
	('00000000-0000-0000-0000-000000000000', 3, 'qfih5xshcc7w', '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', false, '2026-10-11 21:49:07.120217+00', '2026-10-11 21:49:07.120217+00', NULL, 'f5e75fa7-5c85-475a-bb61-885bc2b0da35'),
	('00000000-0000-0000-0000-000000000000', 2, '4jqfuf6epblz', '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', true, '2026-10-11 21:08:17.997938+00', '2026-10-11 22:06:18.293317+00', NULL, '38498ebb-09a4-4685-b68a-e6dec3e6c77d'),
	('00000000-0000-0000-0000-000000000000', 4, 'yhjzjewbkdie', '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', false, '2026-10-11 22:06:18.300675+00', '2026-10-11 22:06:18.300675+00', '4jqfuf6epblz', '38498ebb-09a4-4685-b68a-e6dec3e6c77d');


--
-- Data for Name: sso_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: saml_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: saml_relay_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: scim_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: scim_users; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: sso_domains; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: webauthn_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: webauthn_credentials; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."profiles" ("id", "username", "role", "created_at") VALUES
	('6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'FraM', 'admin', '2026-10-11 21:05:54.738948+00'),
	('e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 'vale-pending', 'user', '2026-10-11 21:53:19.906916+00');


--
-- Data for Name: areas; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."areas" ("id", "created_by", "name", "description", "lat", "lng", "created_at", "updated_at") OVERRIDING SYSTEM VALUE VALUES
	(1, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'Rocca di Baiedo', NULL, 45.95982, 9.448282, '2026-10-11 21:06:43.920675+00', '2026-10-11 21:06:43.920675+00'),
	(2, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'Albard', NULL, 45.608179, 7.758174, '2026-10-11 21:06:43.920675+00', '2026-10-11 21:06:43.920675+00'),
	(3, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'Valle Orco', NULL, NULL, NULL, '2026-10-11 22:14:13.25576+00', '2026-10-11 22:14:13.25576+00');


--
-- Data for Name: places; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."places" ("id", "created_by", "name", "types", "lat", "lng", "parking_lat", "parking_lng", "rock", "exposition", "description", "created_at", "updated_at", "area_id", "start_lat", "start_lng", "grade", "max_altitude", "elevation_gain") OVERRIDING SYSTEM VALUE VALUES
	(1, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'Muro del Butch', '{crag}', 45.908774, 9.434212, NULL, NULL, 'Limestone', '{Nord}', 'In the shadow all day and super fresh even in summer
3 settori: 
- Scala dei Sogni, tiri di quinto, ben appigliati. 4 sesti molto belli e sempre da tirare
- Muretto del Gio: 4 tiri di sesto, placca a tacche e qualche strapiombo
- Muro del Butch: Tiri lunghi e duri con stili che variano, più placca', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:06:43.920675+00', NULL, NULL, NULL, NULL, NULL, NULL),
	(2, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'Falesia di Civate', '{crag}', 45.828727, 9.335894, 45.828727, 9.335894, 'Limestone', '{Sud}', 'Mostly in the shadow. Molti settori, quelli coi gradi più bassi sono molto unti. Ottima per il dopo lavoro e avvicinamento breve. Settore Valle degli Orti il migliore con anche gradi più alti fino 6c', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:06:43.920675+00', NULL, NULL, NULL, NULL, NULL, NULL),
	(3, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'Val di Mello (blocchi)', '{crag}', 46.249768, 9.64196, 46.23945, 9.627467, 'Granite', '{Nord,Sud,Est,Ovest}', 'Blocchi ovunque, ho una guida intera coi settori. La roccia ti mangia la pelle. Bellissima valle anche per passeggiate/vie/falesie', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:06:43.920675+00', NULL, NULL, NULL, NULL, NULL, NULL),
	(4, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'Placca di Pinocchio (Ponte Brolla)', '{multipitch}', 46.189872, 8.756805, 46.189872, 8.756805, 'Granite', '{Ovest}', 'Sole dopo le 11 a.m. Tutta placca, molto sporca occhio', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:06:43.920675+00', NULL, NULL, NULL, NULL, NULL, NULL),
	(5, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'Falesia Esigo-Ponte Romano', '{crag}', 46.282635, 8.287281, 46.285113, 8.287014, 'Granite', '{Nord}', 'Shadow all day. Bella roccia, più di 70 tiri, anche se affollata c''è roba da fare, si sta al fresco anche d''estate', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:06:43.920675+00', NULL, NULL, NULL, NULL, NULL, NULL),
	(6, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'Zucco dell''Angelone', '{multipitch}', 45.958137, 9.459862, 45.954905, 9.465767, 'Limestone', '{Sud}', 'Sentieri e avvicinamento segnalati molto male. Attacchi delle vie anche peggio. Pienissimo di vie chiodate a caso che si incrociano, leggere più relazioni attentamente.', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:06:43.920675+00', NULL, NULL, NULL, NULL, NULL, NULL),
	(7, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'Falesia del cannone', '{crag}', 45.981249, 8.39887, 45.984583, 8.400296, 'Limestone', '{Est}', 'Falesia in ombra dalle 11, roccia nera che scotta al sole. gradi fino al 6b, vecchia palestra CAI.', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:06:43.920675+00', NULL, NULL, NULL, NULL, NULL, NULL),
	(8, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'Falesia calusco d''adda', '{crag}', 45.682229, 9.455296, 45.684741, 9.458401, 'Conglomerato', '{Nord,Sud,Est,Ovest}', 'Roccia particolare, di difficile lettura le prime volte, ma molto bella. diversi settori con tutti i gradi di difficoltà. Ottima anche d''estate, occhio alle zanzare', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:06:43.920675+00', NULL, NULL, NULL, NULL, NULL, NULL),
	(9, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'Ailefroide', '{crag,multipitch}', 44.885185, 6.450342, 44.885185, 6.450342, 'Granite', '{Nord,Sud,Est,Ovest}', 'Bellissimo posto pieni di vie/falesie/blocchi. il campeggio è molto comodo e costa poco', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:06:43.920675+00', NULL, NULL, NULL, NULL, NULL, NULL),
	(10, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'Falesia di Valgua', '{crag}', 45.780462, 9.778912, 45.776395, 9.781794, 'Limestone', '{Nord}', 'Ci sono vari settori, su theCrag sono segnati più tiri di quelli che effettivamente abbiamo trovato. Bella falesia estiva, gradi non banali, dal 5c in su', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:06:43.920675+00', NULL, NULL, NULL, NULL, NULL, NULL),
	(11, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'Moregallo', '{crag}', 45.881456, 9.340185, 45.880406, 9.344428, 'Limestone', '{Ovest}', 'Traverso bellissimo sul lago, a pochi metri di altezza dall''acqua, per qualunque livello. stando bassi è più facile, la parte finale bianca è dura. C''è anche una falesia con tiri sui sesti.', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:06:43.920675+00', NULL, NULL, NULL, NULL, NULL, NULL),
	(12, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'Falesia Introbio', '{crag}', 45.960178, 9.452256, 45.960706, 9.450489, 'Limestone', '{Nord,Sud}', 'Avvicinamento molto corto, chi fa sicura sta all''ombra. Dipende un po'' dal settore ma si trovano anche tiri completamente in ombra', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:06:43.920675+00', NULL, NULL, NULL, NULL, NULL, NULL),
	(13, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'Grignetta', '{multipitch}', 45.920542, 9.388661, 45.905628, 9.394608, 'Limestone', '{Nord,Sud,Est,Ovest}', 'Viene giù tutto, bussare sempre. Piena di vie molto belle anche storiche principalmente da integrare. Avvicinamento un po'' lunghino e tosto. Non facile trovare gli attacchi delle vie, ci vuole un po'' di esperienza', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:06:43.920675+00', NULL, NULL, NULL, NULL, NULL, NULL),
	(14, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'Placche di Oriana', '{multipitch}', 45.623589, 7.701536, 45.61926, 7.70877, 'Gneiss', '{Sud}', 'Bellissima roccia, tiene tantissmo, principalmente placca come dice il nome. Si possono tranquillamente provare vie più dure considerando l''ottima spittatura', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:06:43.920675+00', NULL, NULL, NULL, NULL, NULL, NULL),
	(15, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'Falesia Grotta', '{crag}', 45.6223, 7.705, 45.61926, 7.70877, 'Gneiss', '{Nord,Sud}', 'Falesia sotto le placche di Oriana, molto carina anche per finire la giornata dopo una via', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:06:43.920675+00', NULL, NULL, NULL, NULL, NULL, NULL),
	(16, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'Costa dell''Anglone', '{multipitch}', 45.97082, 10.911493, 45.968008, 10.914529, 'Dolomia', '{Est}', 'Dal parcheggio 15 minuti e si attaccano le vie, molto comodo, vie lunghe e spittate molto belle.', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:06:43.920675+00', NULL, NULL, NULL, NULL, NULL, NULL),
	(17, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'Falesia Val di Lomasone', '{crag}', 45.972855, 10.86498, 45.970931, 10.858746, 'Dolomia', '{Ovest}', 'Bellissima falesia, in un locus amenus idilliaco. Gradi dai quinti ai settimi, vari settori', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:06:43.920675+00', NULL, NULL, NULL, NULL, NULL, NULL),
	(18, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'Santa Massenza', '{multipitch}', 46.068277, 10.978479, 46.065547, 10.980358, 'Dolomia', '{Est}', 'Tipiche vie dolomitiche, un po'' da integrare. Aperte di recente.', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:06:43.920675+00', NULL, NULL, NULL, NULL, NULL, NULL),
	(19, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'Campanile Basso', '{multipitch}', 46.161406, 10.892466, 46.206102, 10.850984, 'Dolomia', '{Nord,Sud,Est,Ovest}', 'Tipica scalata dolomitica, l''esposizione dipende dalla via che scegli, la normale ce le ha tutte', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:06:43.920675+00', NULL, NULL, NULL, NULL, NULL, NULL),
	(20, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'Rocca di Baiedo', '{multipitch}', 45.95982, 9.448282, 45.960851, 9.449404, 'Limestone', '{Sud}', 'Easy parking and very short walk to get to the routes', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:06:43.920675+00', 1, NULL, NULL, NULL, NULL, NULL),
	(21, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'Solitudine', '{multipitch}', 45.959593, 9.448387, NULL, NULL, 'Limestone', '{Sud}', NULL, '2026-10-11 21:06:43.920675+00', '2026-10-11 21:06:43.920675+00', 1, 45.959593, 9.448387, NULL, NULL, NULL),
	(22, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'Albard', '{multipitch}', 45.608179, 7.758174, 45.609896, 7.759875, 'Gneiss', '{Sud}', 'Carina, vie facili e ben spittate, non andare d''estate', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:06:43.920675+00', 2, NULL, NULL, NULL, NULL, NULL),
	(23, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'Ozzy', '{multipitch}', 45.608189, 7.758327, NULL, NULL, 'Gneiss', '{Sud}', NULL, '2026-10-11 21:06:43.920675+00', '2026-10-11 21:06:43.920675+00', 2, 45.608189, 7.758327, NULL, NULL, NULL),
	(25, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'Falesia Bosco', '{crag}', 45.408468, 7.506321, 45.407395, 7.505919, 'Gneiss', '{Nord,Sud,Est,Ovest}', 'Falesia giustamente nel bosco. Frequentabile tutto l''anno. La roccia è stupenda, granito pieno di prese, soprattutto svase. Tutti i tiri sono verticali o strapiombanti, zero placca.', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:06:43.920675+00', NULL, NULL, NULL, NULL, NULL, NULL),
	(24, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'Blocchi Fonti minerali', '{crag}', 45.429448, 7.25095, 45.43011, 7.250239, 'Gneiss', '{Nord,Sud,Est,Ovest}', 'Zona per fare blocchi subito dietro il rifugio. Tutte le difficoltà e vari tipi di scalata', '2026-10-11 21:06:43.920675+00', '2026-10-11 22:14:23.399376+00', 3, NULL, NULL, NULL, NULL, NULL),
	(26, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'Via table de roc', '{multipitch}', 45.613962, 7.76051, 45.613962, 7.76051, 'Gneiss', '{}', 'Bella via, sul 4/5a, a parte un tiro di 5c molto bello, da fare in dulfer e poi tra un diedro e il suo spigolo', '2026-10-11 22:25:20.419839+00', '2026-10-11 22:25:20.419839+00', 2, NULL, NULL, '5c', NULL, NULL);


--
-- Data for Name: sectors; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."sectors" ("id", "place_id", "name", "position") OVERRIDING SYSTEM VALUE VALUES
	(1, 1, 'Scala dei sogni', 0),
	(2, 1, 'Muretto del Gio', 1),
	(3, 1, 'Muro del Butch', 2),
	(4, 2, 'Valle degli Orti', 0),
	(5, 2, 'Buco della Sabbia', 1),
	(6, 2, 'Amazzonia + Palestra vecchia', 2),
	(7, 2, 'La balconata', 3),
	(8, 3, 'Proprietà privata', 0),
	(9, 6, 'Terzo sperone', 0),
	(10, 6, 'Quarto sperone', 1),
	(11, 8, 'Settore 1 (più vicino all''ingresso)', 0),
	(12, 10, 'Minolandia', 0),
	(13, 12, 'Sasso d''Introbio', 0),
	(14, 12, 'Pala Condor', 1),
	(15, 12, 'Muro d''Introbio', 2),
	(16, 13, 'Grigna meridionale', 0),
	(17, 14, 'Settore destro', 0),
	(18, 17, 'Settore 2', 0),
	(19, 17, 'Settore 4', 1);


--
-- Data for Name: visits; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."visits" ("id", "user_id", "place_id", "date", "summary", "approach", "descent", "visibility", "created_at", "updated_at", "conditions", "duration_hours") OVERRIDING SYSTEM VALUE VALUES
	(1, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 1, '2026-07-11', NULL, NULL, NULL, 'private', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:53:19.906916+00', NULL, NULL),
	(2, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 1, '2026-06-20', NULL, NULL, NULL, 'private', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:53:19.906916+00', NULL, NULL),
	(3, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 1, '2026-05-23', NULL, NULL, NULL, 'private', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:53:19.906916+00', NULL, NULL),
	(4, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 2, '2026-06-12', 'Unico settore di Civate che merita, tiri un po'' più duri ma molto belli e lunghi e molto meno unti', NULL, NULL, 'private', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:53:19.906916+00', NULL, NULL),
	(5, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 2, '2026-05-20', 'Completato il settore Amazzonia e Palestra vecchia, i 6a sono banali, magari un passaggio duro. Diventano più duri se vai su dritto seguendo gli spit, spostandosi un po'' sono facili', NULL, NULL, 'private', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:53:19.906916+00', NULL, NULL),
	(6, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 3, '2026-07-05', 'Compleanno di Ire, scalato con dei suoi amici stra forti. Primo 6c blocco!', NULL, NULL, 'private', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:53:19.906916+00', NULL, NULL),
	(7, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 3, '2026-05-09', 'Melloblocco, prima volta nella vita. Fighissimo, ambiente stupendo con un sacco di persone che scalano, mai troppo affollato', NULL, NULL, 'private', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:53:19.906916+00', NULL, NULL),
	(8, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 4, '2026-06-27', NULL, NULL, NULL, 'private', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:53:19.906916+00', NULL, NULL),
	(9, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 5, '2026-06-28', NULL, NULL, NULL, 'private', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:53:19.906916+00', NULL, NULL),
	(10, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 6, '2026-06-13', NULL, NULL, NULL, 'private', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:53:19.906916+00', NULL, NULL),
	(11, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 6, '2026-05-01', '2 ore per trovare l''attacco, 6 ore per salire sbagliando strada ad ogni tiro. Calate sui tiri saliti bruttissime', 'Parcheggiare prima della funivia di Bobbio. imboccare il sentiero subito sotto, dietro la stessa. Seguire per il terzo/quarto sperone. Superati dei tratti con catena e cavo metallico, si arriva al canale che divide terzo e quarto sperone. Proseguire oltre a poi salire leggermente a destra, c''è una targhetta commemorativa e sopra ad esse l''attacco', 'Dalla cima c''è un sentiero non segnalato benissimo, ci si perde facilmente ma si torna giù', 'private', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:53:19.906916+00', NULL, NULL),
	(12, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 7, '2026-06-21', NULL, NULL, NULL, 'private', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:53:19.906916+00', NULL, NULL),
	(13, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 8, '2026-06-06', NULL, NULL, NULL, 'private', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:53:19.906916+00', NULL, NULL),
	(14, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 9, '2026-06-01', NULL, NULL, NULL, 'private', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:53:19.906916+00', NULL, NULL),
	(15, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 9, '2026-06-02', NULL, NULL, NULL, 'private', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:53:19.906916+00', NULL, NULL),
	(16, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 10, '2026-07-25', NULL, NULL, NULL, 'private', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:53:19.906916+00', NULL, NULL),
	(17, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 11, '2026-07-30', 'Fatto il traverso fino all''inizio della parte bianca. Caduto una volta perchè si è rotto un piede. Eravamo tantissimi e poi grigliata sulla spiaggia', NULL, NULL, 'private', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:53:19.906916+00', NULL, NULL),
	(18, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 12, '2026-05-24', 'Secondo giorno di fila di falesia. ci sono dei bervi multipitch molto belli alla placca condor', NULL, NULL, 'private', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:53:19.906916+00', NULL, NULL),
	(19, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 13, '2026-08-09', 'Via molto bella, soprattutto perchè arrivi in cima alla grigna dopo aver fatto l''ultimo pezzo della cresta segantini', 'Dai piani dei resinelli, salire verso il rifugio porta per la strada asfaltata superando le sbarre. prendere il sentiero nel bosco che inizia ad una curva verso destra. Al bivio con cartelli seguire a destra (Direttissima) e farsi tutta la costa fino alla ferrata (scala di metallo). Proseguire ancora oltrepassando il Fungo tenendolo sulla sinistra. Si arriva al canalone Angelina, risalirlo (non banale). prima di arrivare verso la cresta stare sulla destra per il sentiero Cecilia. Dopo un altro tratto con catena si aggira uno sperone e risalendo un po'' c''è l''attacco della via con scritto via Zucchi', 'Dalla cima della grigna comodo sentiero che riporta ai piani dei resinelli', 'private', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:53:19.906916+00', NULL, NULL),
	(20, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 13, '2026-08-15', 'Volevamo concatenare i tre Magnaghi, ma alla fine abbiamo fatto solo il meridionale. nella calata abbiamo visto il ''traversino'' per spostarsi sul centrale, è da cagarsi addosso', 'continuare sulla strada asfaltata che passa davanti al rifugio dei resinelli, dopo poco diventa sterrata. Parcheggiare e proseguire a piedi per il sentiero, subito un cartello per il canalone Porta. Inconfondibile, risalirlo fino alla fine. Si vede la piattaforma per gli elicotteri. Da lì proseguire verso il magnaghi meridionale, si vede un gabbiotto per le barelle. Risalire le non banali roccette di III e infilarsi in una spaccatura che porta all''attacco del sigaro e delle vie sul Magnaghi meridionale. La via parte lì in fondo, si può prendere un fittone oppure scendere di più e passare dalla sosta del primo tiro del sigaro o del canalino albertini', 'dal masso con scritto lemonsoda in vetta ci si può calare o disarrampicare delle facili roccette per 15 metri fino ad un anello di calata all''altezza dell''intaglio tra i due magnaghi. Si può traversare all''altro magnaghi o continuare la calata sulla normale del magnaghi meridionale', 'private', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:53:19.906916+00', NULL, NULL),
	(21, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 14, '2026-05-16', 'Cercavamo qualcosa di sportivo e non troppo lungo. Piacevolissima via, se ne possono fare altre nello stesso giorno, dalla cima all''attacco sono 20 minuti a piedi', 'Dal parcheggio a Courtil si segue la strada asfaltata, dopo un tornante c''è un sentiero che sale e porta alla base della parete del settore destro con tutte le vie segnate da una placca metallica col nome', 'Comodissimo sentiero che riporta all''attacco', 'private', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:53:19.906916+00', NULL, NULL),
	(22, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 15, '2026-05-16', 'Falesia tranquilla dopo la via, ci siamo fatti sicura con 2 doppie e il secchiello D:', NULL, NULL, 'private', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:53:19.906916+00', NULL, NULL),
	(23, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 16, '2026-04-25', 'Dovevamo fare un''altra via più facile ma c''era gente e quindi io e Lu siamo andati su questa. Ottima scelta! Ci hanno superato dei bergamaschi del CAI, ma hanno scordato un rinvio che ci siamo guadagnati onestamente. Via piena di traversi sprotetti comunque.', 'Parcheggiare al campo sportivo, seguire la strada che diventa subito sentiero nel bosco e in pochi minuti si raggiungono gli attacchi delle vie', 'Sentiero che riporta al campo sportivo con una ferratina finale', 'private', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:53:19.906916+00', NULL, NULL),
	(24, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 17, '2026-04-26', 'settore 4 è il più nuovo ed è gradato un po'' alto rispetto alla difficoltà effettiva. Gli altri settori hanno spit un po'' vecchi, ma i tiri sono bellissimi. Il campanile arrivi proprio sopra a sto pilastro di roccia!', NULL, NULL, 'private', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:53:19.906916+00', NULL, NULL),
	(25, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 18, '2026-08-23', 'Luca ha fatto da fotografo e intrattenitore. Libro di vetta simpatico. I tizi che l''hanno aperta sono del luogo probabilmente e hanno aperto varie vie qui', 'Dal parcheggio proseguire 20 metri sulla strada e prendere il sentiero che sale sulla sinistra. Seguirlo e fidarsi della relazione. Bivio a destra, superare spigolo nascosto, continuare per dei ripidi zig zag e si arriva alla via che attacca dove c''è la targhetta col nome', 'Seguire il sentiero che va a destra dalla cima e fidarsi della relazione. Continua in mezza costa a sinistra, supera traliccio, arte di ferrata e poi giù a destra', 'private', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:53:19.906916+00', NULL, NULL),
	(26, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 19, '2026-08-26', 'CHE FIGATA E CHE CAGA, prima via classica. Una bellissima giornata di 19 ore di attività fisica', 'Dormito al rifugio Tosa-Pedrotti, si raggiunge in 3 ore e 15 minuti dal parcheggio di Vallesinella. Dal rifugio si torna alla bocchetta di Brenta e si attacca la ferrata delle bocchette. Si raggiunge la bocchetta del campanile basso è l''attacco e 5 metri sotto a sinistra', '8 doppie dalla cima che seguono circa la normale. Occhio che si incastra facile al prima e a noi anche l''ultima', 'private', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:53:19.906916+00', NULL, NULL),
	(27, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 20, '2026-09-19', 'ci abbiamo messo 2 ore e mezza come da relazione, mai successo. Via carina, non difficile. Avvicinamento e parcheggio top. Si arriva in cima alla rocca ed è molto carino, da provare altre vie qui.', 'camminando sul comodo sentiero fino al cartello e dopo 20 metri in salita si è all''attacco segnato con targa', 'Comodissimo sentiero, salire prima alla cima della rocca piegando a sinistra e poi si scende a Baiedo e da lì si torna all''auto', 'private', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:53:19.906916+00', NULL, NULL),
	(28, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 22, '2026-09-20', 'Via carina, soprattutto le pareti verticali. Comunque facile e ben spittata. Ultima via di Andre <3', 'Dal parcheggio salire la scala di roccia che porta al PAGGIO. Da lì seguire il sentiero che scende passando per una baita nella roccia, delle catene fisse e poi diventa un sentiero segnato con bolli fluo (senza la traccia di Lu ci saremmo persi)', 'Comodo sentiero dalla cima, alla baita proseguire verso destra faccia a monte e si torna al paggio', 'private', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:53:19.906916+00', NULL, NULL),
	(29, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 24, '2026-09-26', '6 ore di blocchi durante il festival in Valle Orco. FIGHISSIMO. Fatto un po'' di 6a / 6b e provato per due ore Ceresole Royal 7a, traverso lunghissimo su tacche <3', NULL, NULL, 'private', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:53:19.906916+00', NULL, NULL),
	(30, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 25, '2026-09-27', 'Eravamo tritati dai blocchi del giorno prima, ma comunque fighissimi i tiri. Tanto di resistenza sugli avambracci', NULL, NULL, 'private', '2026-10-11 21:06:43.920675+00', '2026-10-11 21:53:19.906916+00', NULL, NULL),
	(31, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 26, '2026-10-10', NULL, 'parcheggiare in alto, alla fine della strada dove si arriva proprio al paese di albard (non al parcheggio per le vie in basso)', NULL, 'private', '2026-10-11 22:25:20.847023+00', '2026-10-11 22:25:20.847023+00', 'perfetta giornata autunnale', NULL);


--
-- Data for Name: ascents; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."ascents" ("id", "visit_id", "sector_id", "name", "grade", "comment", "position") OVERRIDING SYSTEM VALUE VALUES
	(1, 1, 1, 'Su alto', '6c', 'primo 6c!!! alla scala dei sogni l''unico che c''è', 0),
	(2, 1, 1, 'Busazza', '6b', 'alla scala dei sogni il solito molto bello e fisico', 1),
	(3, 1, 2, 'Al guanaco', '6b', 'al muretto del Gio di fianco al 6c, molto carino e continuo di placca a tacche, fine atletica in strapiombo', 2),
	(4, 1, 1, 'L''amata grigna', '6a', 'alla scala dei sogni, tecnico molto bello', 3),
	(5, 2, 1, 'Su alto', '6c', 'non chiuso ma fattibile', 0),
	(6, 2, 2, 'Fratelli d''arte', '6b+', 'al muretto, non chiuso, intro dura poi di resistenza', 1),
	(7, 3, 1, 'Busazza', '6b', 'Chiuso al primo giro fanlmente!', 0),
	(8, 3, 3, NULL, '6a+', 'Blocco tecnico in cima, prima una scala', 1),
	(9, 3, 3, NULL, '6a+', 'di continuità con strapimbo e poi placca, mai banale', 2),
	(10, 4, 4, 'Donne in attesa', '6a', 'Belo, lungo, un po'' untino il passagio duro sotto', 0),
	(11, 4, 4, 'Via Nomentana', '6b', 'Bello, lungo, duro sotto. Allungo al limite', 1),
	(12, 5, 6, NULL, '6a', NULL, 0),
	(13, 6, 8, 'Masso dei veronesi', '6c', 'Primo blocco 6c! Link del 6a+ sit e del classico 6a stand', 0),
	(14, 6, 8, 'Muro dei Granchi', '6a+', 'uscito a destra, duro', 1),
	(15, 6, 8, 'Muro dei Granchi', '6b', 'Allungo e via', 2),
	(16, 7, 8, 'Masso dei veronesi', '6a', NULL, 0),
	(17, 8, NULL, 'Via Harlem', '5b', 'Tutta placca, molto sporca (questo ha alzato la difficoltà parecchio perchè si scivolava). Un cado boia, da fare in autunno/primavera, è in ombra fino alle 11 circa', 0),
	(18, 9, NULL, 'Deverino Valley', '5c', 'Carina, passaggio non banale sotto poi placca di equilibrio', 0),
	(19, 10, 9, 'Ortofrsco + Schiavi della pietra', '5b', 'Facili, ma molto carine. Prime due soste di ortofresco mancanti', 0),
	(20, 11, 10, 'Anabiasi', 'VI-', 'Non si capisce dove andare, ci sono mille vie che si incrociano. La via in sè è carina, la rifarei per completarla', 0),
	(21, 12, NULL, 'Il ragno', '6b', 'uscita dallo strapiombo dura', 0),
	(22, 13, 11, 'Mal di dita', '5c', NULL, 0),
	(23, 13, 11, 'Spirito solitario', '6a+', 'continuo', 1),
	(24, 13, 11, 'Money Penny', '6a+', 'Incomprensibile', 2),
	(25, 13, 11, 'Grazie Cinzia diretto', '6b', 'carino di dita', 3),
	(26, 14, NULL, 'Ecrins total', '5c', 'Via di 5 tiri, traverso duro al terzo tiro', 0),
	(27, 15, NULL, NULL, '5c', 'lungo e tecnico', 0),
	(28, 15, NULL, NULL, '6c', 'top rope, passo di placca con nulla', 1),
	(29, 16, 12, 'Prendi il fossile', '6a', NULL, 0),
	(30, 16, 12, 'Rovescio d''occasione', '6a+', NULL, 1),
	(31, 16, 12, 'Una gita con Roby', '6a+', NULL, 2),
	(32, 16, 12, 'Boletus Edulis', '7a', 'fatto di scaldo e sucato male neanche finito, da riprovare', 3),
	(33, 16, 12, 'Donald Duck', '5c', NULL, 4),
	(34, 17, NULL, 'Traverso', '6b', NULL, 0),
	(35, 18, 14, NULL, '5c', 'multipitch', 0),
	(36, 18, 14, NULL, '6a+', 'tacchette già provato in passato, carino e di dita', 1),
	(37, 18, 14, NULL, '6b', 'blocco di entrata impossibile', 2),
	(38, 18, 15, NULL, '6a', 'tecnico al muro, caduto nel passaggio in strapoimbo', 3),
	(39, 19, 16, 'Via Zucchi', 'IV+', 'probabilemente un passo di quinto protetto solo da un tuo friend', 0),
	(40, 20, 16, 'Spigolo Dorn', 'IV', 'via molto facile, poco da integrare, si ricongiunge agli ultimi tiri del canalino albertini', 0),
	(41, 21, 17, 'Rue de la Gueriso', '5c+', 'Via sportiva spittata corta sui pezzi dura e lunga su quelli facili, molto bella', 0),
	(42, 22, NULL, 'Aquila reale', '6b', 'Un passaggio di fiducia in spalmo fa stra paura', 0),
	(43, 22, NULL, 'Pernice bianca', '6a', 'molto carina, con vari incastri in fessura', 1),
	(44, 23, NULL, 'Mercurio Serpeggianti', 'VI A0/V', 'Via bellissma, abbastanza lunga. Alternarsi con Luca che fa le placche top. Il tiro di sesto è uno strapiombo abbastanza duro, ma tutto azzerabile con cordoni', 0),
	(45, 24, 18, 'Camapnile sud', '6a', 'Chiodi arrugginiti, ma hanno tenuto, che caga!', 0),
	(46, 24, 19, 'Via delle salamandre', '6a', 'Carina, strapiombo deciso alla fine', 1),
	(47, 25, NULL, 'Piccola Nizza di Trent', 'V', 'Via carina, un po'' da integrare ma piena di chidoi sul tiro più duro, comunque un diedro interessante', 0),
	(48, 26, NULL, 'Via Normale', 'V', 'STUPENDA. Abbiamo sbagliato strada un po'' di vote sui tiri, ma si fa. Difficoltà tecnica bassa ma è tutto da integrare tranne la Poli e l''ultimo tiro se segui i chiodi sul quinto', 0),
	(49, 27, NULL, 'Solitudine', 'V/V+', NULL, 0),
	(50, 28, NULL, 'Ozzy', 'V+', 'carina, le pareti verticali sono divertenti da scalare', 0),
	(51, 30, NULL, 'La bamba', '6b', NULL, 0),
	(52, 30, NULL, 'Satanatt', '6c', NULL, 1),
	(53, 30, NULL, 'C''era una volta', '5+++', NULL, 2),
	(54, 30, NULL, 'Mamba', '6a', NULL, 3);


--
-- Data for Name: attachments; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."attachments" ("id", "place_id", "area_id", "created_by", "kind", "title", "url", "storage_path", "size_bytes", "created_at") OVERRIDING SYSTEM VALUE VALUES
	(1, 1, NULL, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'link', 'Guide', 'https://larioclimb.paolo-sonja.net/falesie_lecco/ilmurodelbutch/index.html', NULL, NULL, '2026-10-11 21:06:43.920675+00'),
	(2, 2, NULL, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'link', 'Guide', 'https://larioclimb.paolo-sonja.net/falesie_lecco/civate/index.html', NULL, NULL, '2026-10-11 21:06:43.920675+00'),
	(3, 3, NULL, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'link', 'Guide', 'https://www.thecrag.com/it/arrampicata/italy/val-di-mello/area/1279720257', NULL, NULL, '2026-10-11 21:06:43.920675+00'),
	(4, 4, NULL, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'link', 'Guide', 'https://www.sassbaloss.com/pagine/uscite/harlem/harlem.htm', NULL, NULL, '2026-10-11 21:06:43.920675+00'),
	(5, 5, NULL, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'link', 'Guide', 'https://www.gulliver.it/itinerari/esigo-ponte-romano-falesia/', NULL, NULL, '2026-10-11 21:06:43.920675+00'),
	(6, 6, NULL, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'link', 'Guide', 'https://www.gulliver.it/itinerari/zucco-dellangelone/', NULL, NULL, '2026-10-11 21:06:43.920675+00'),
	(7, 7, NULL, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'link', 'Guide', 'https://www.gulliver.it/itinerari/cannone-giova-1/', NULL, NULL, '2026-10-11 21:06:43.920675+00'),
	(8, 8, NULL, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'link', 'Guide', 'https://www.falesia.it/crag/116/calusco-paderno.html', NULL, NULL, '2026-10-11 21:06:43.920675+00'),
	(9, 10, NULL, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'link', 'Guide', 'https://www.thecrag.com/it/arrampicata/italy/valgua', NULL, NULL, '2026-10-11 21:06:43.920675+00'),
	(10, 12, NULL, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'link', 'Guide', 'https://larioclimb.paolo-sonja.net/falesie_lecco/introbio/index.html', NULL, NULL, '2026-10-11 21:06:43.920675+00'),
	(11, 13, NULL, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'link', 'Guide', 'https://larioclimb.paolo-sonja.net/bacheca/cmlo_grigne_medale.html', NULL, NULL, '2026-10-11 21:06:43.920675+00'),
	(12, 14, NULL, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'link', 'Guide', 'https://www.thecrag.com/it/arrampicata/italy/placche-di-oriana', NULL, NULL, '2026-10-11 21:06:43.920675+00'),
	(13, 15, NULL, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'link', 'Guide', 'https://www.thecrag.com/it/arrampicata/italy/placche-di-oriana/area/9435180468', NULL, NULL, '2026-10-11 21:06:43.920675+00'),
	(14, 16, NULL, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'link', 'Guide', 'https://www.thecrag.com/it/arrampicata/italy/arco/area/579485835', NULL, NULL, '2026-10-11 21:06:43.920675+00'),
	(15, 17, NULL, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'link', 'Guide', 'https://www.thecrag.com/it/arrampicata/italy/val-lomasone', NULL, NULL, '2026-10-11 21:06:43.920675+00'),
	(16, 18, NULL, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'link', 'Guide', 'https://www.inmontagna.blog/via-picola-nizza-de-trent-santa-massenza-trad-didattico/', NULL, NULL, '2026-10-11 21:06:43.920675+00'),
	(17, 19, NULL, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'link', 'Guide', 'https://www.sassbaloss.com/pagine/uscite/campanilebasso/campanilebasso.htm', NULL, NULL, '2026-10-11 21:06:43.920675+00'),
	(18, 20, NULL, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'link', 'Guide', 'https://www.scuolaguidodellatorre.it/relazioni/RoccaBaiedo-viaSolitudine/571/', NULL, NULL, '2026-10-11 21:06:43.920675+00'),
	(19, 22, NULL, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'link', 'Guide', 'https://www.thecrag.com/it/arrampicata/italy/northern-italy/val-daosta/verres-donnas-area/area/5783995395', NULL, NULL, '2026-10-11 21:06:43.920675+00'),
	(20, 25, NULL, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'link', 'Guide', 'https://www.gulliver.it/itinerari/bosco-falesia-di/', NULL, NULL, '2026-10-11 21:06:43.920675+00'),
	(21, 26, NULL, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'link', NULL, 'https://www.vielunghe.com/albard-via-table-de-roc/', NULL, NULL, '2026-10-11 22:42:58.879499+00');


--
-- Data for Name: partners; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."partners" ("id", "owner_id", "name", "linked_user_id") OVERRIDING SYSTEM VALUE VALUES
	(1, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 'Vale', NULL),
	(2, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 'Ale', NULL),
	(3, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 'Andre', NULL),
	(4, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 'AndreB', NULL),
	(5, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 'BeaBassi', NULL),
	(6, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 'Chiara', NULL),
	(7, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 'Fede', NULL),
	(8, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 'Fra', NULL),
	(9, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 'Gipi', NULL),
	(10, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 'Ire', NULL),
	(11, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 'Isa', NULL),
	(12, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 'Japo', NULL),
	(13, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 'Luca', NULL),
	(14, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 'Nico', NULL),
	(15, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 'SaraG', NULL),
	(16, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 'SaraS', NULL),
	(17, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 'Sere', NULL),
	(18, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 'Ari', NULL),
	(19, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 'Morgana', NULL),
	(20, 'e3c8c6cb-f140-47be-8c6d-b83a8ec53263', 'Selma', NULL),
	(21, '6ad65c42-4d7f-4f12-8a7f-8abb51d1ca87', 'japo', NULL);


--
-- Data for Name: photos; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: visit_partners; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."visit_partners" ("visit_id", "partner_id") VALUES
	(1, 10),
	(1, 1),
	(2, 14),
	(2, 1),
	(3, 3),
	(3, 6),
	(3, 8),
	(3, 13),
	(3, 1),
	(4, 15),
	(4, 1),
	(5, 6),
	(5, 8),
	(5, 13),
	(5, 1),
	(6, 9),
	(6, 10),
	(6, 16),
	(6, 1),
	(7, 9),
	(7, 10),
	(7, 1),
	(8, 10),
	(8, 12),
	(8, 13),
	(8, 15),
	(8, 1),
	(9, 10),
	(9, 12),
	(9, 13),
	(9, 1),
	(10, 3),
	(10, 7),
	(10, 12),
	(10, 15),
	(10, 1),
	(11, 2),
	(11, 13),
	(11, 17),
	(11, 1),
	(12, 3),
	(12, 10),
	(12, 12),
	(12, 15),
	(12, 1),
	(13, 8),
	(13, 12),
	(13, 13),
	(13, 15),
	(13, 1),
	(14, 10),
	(14, 15),
	(14, 1),
	(15, 3),
	(15, 8),
	(15, 10),
	(15, 11),
	(15, 13),
	(15, 15),
	(15, 1),
	(16, 3),
	(16, 10),
	(16, 11),
	(16, 14),
	(16, 1),
	(17, 3),
	(17, 4),
	(17, 5),
	(17, 6),
	(17, 7),
	(17, 8),
	(17, 10),
	(17, 14),
	(17, 1),
	(18, 10),
	(18, 14),
	(18, 15),
	(18, 1),
	(19, 12),
	(19, 1),
	(20, 8),
	(20, 13),
	(20, 14),
	(20, 1),
	(21, 3),
	(21, 8),
	(21, 13),
	(21, 1),
	(22, 3),
	(22, 8),
	(22, 13),
	(22, 1),
	(23, 3),
	(23, 7),
	(23, 8),
	(23, 12),
	(23, 13),
	(23, 1),
	(24, 3),
	(24, 7),
	(24, 8),
	(24, 12),
	(24, 13),
	(24, 1),
	(25, 12),
	(25, 13),
	(25, 1),
	(26, 3),
	(26, 12),
	(26, 13),
	(26, 1),
	(27, 14),
	(28, 3),
	(28, 13),
	(28, 15),
	(29, 18),
	(29, 7),
	(29, 20),
	(30, 7),
	(30, 19),
	(30, 20),
	(31, 21);


--
-- Data for Name: buckets; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type", "versioning_status", "lifecycle_configuration", "lifecycle_configuration_generation") VALUES
	('place-files', 'place-files', NULL, '2026-10-11 20:55:20.969162+00', '2026-10-11 20:55:20.969162+00', true, false, 20971520, NULL, NULL, 'STANDARD', 'DISABLED', NULL, NULL),
	('place-photos', 'place-photos', NULL, '2026-10-11 22:33:46.755054+00', '2026-10-11 22:33:46.755054+00', true, false, 10485760, '{image/jpeg,image/webp,image/png}', NULL, 'STANDARD', 'DISABLED', NULL, NULL),
	('visit-photos', 'visit-photos', NULL, '2026-10-11 22:33:46.755054+00', '2026-10-11 22:33:46.755054+00', false, false, 10485760, '{image/jpeg,image/webp,image/png}', NULL, 'STANDARD', 'DISABLED', NULL, NULL);


--
-- Data for Name: buckets_analytics; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: buckets_vectors; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: objects; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: s3_multipart_uploads; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: s3_multipart_uploads_parts; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: vector_indexes; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: supabase_auth_admin
--

SELECT pg_catalog.setval('"auth"."refresh_tokens_id_seq"', 4, true);


--
-- Name: areas_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."areas_id_seq"', 3, true);


--
-- Name: ascents_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."ascents_id_seq"', 54, true);


--
-- Name: attachments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."attachments_id_seq"', 21, true);


--
-- Name: partners_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."partners_id_seq"', 21, true);


--
-- Name: photos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."photos_id_seq"', 1, false);


--
-- Name: places_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."places_id_seq"', 26, true);


--
-- Name: sectors_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."sectors_id_seq"', 19, true);


--
-- Name: visits_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."visits_id_seq"', 31, true);


--
-- PostgreSQL database dump complete
--

-- \unrestrict JkjH3AcGdoKniRn0DlruvEGdP7yRYzIncfohiR0AZXJ4UrHSkaB3ywo3rhw5NTj

RESET ALL;
