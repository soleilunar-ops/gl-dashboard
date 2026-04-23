-- ============================================================
-- station_catalog 한글 이스케이프 복구
-- 원인: 이전 migration에서 \uXXXX 리터럴이 Postgres 일반 문자열로 저장됨
-- 식별: LENGTH > 5 (정상 한글 지명은 2-3자, 깨진 리터럴은 12자)
-- ============================================================

-- 1) station_catalog 교정 (asos_stn_id로 안전하게 식별)
UPDATE public.station_catalog SET station_code='서울', station_kor_name='서울', notes='분석 기본 관측소' WHERE asos_stn_id='108';
UPDATE public.station_catalog SET station_code='수원', station_kor_name='수원', notes='경기 예비' WHERE asos_stn_id='119';
UPDATE public.station_catalog SET station_code='대전', station_kor_name='대전', notes='충청 예비' WHERE asos_stn_id='133';
UPDATE public.station_catalog SET station_code='광주', station_kor_name='광주', notes='호남 예비' WHERE asos_stn_id='156';
UPDATE public.station_catalog SET station_code='부산', station_kor_name='부산', notes='영남 예비' WHERE asos_stn_id='159';

-- 2) weather_unified 의 깨진 station 행 전부 제거
-- (정상 한글은 2-3자, 깨진 값은 12자)
DELETE FROM public.weather_unified 
WHERE LENGTH(station) > 5;;
