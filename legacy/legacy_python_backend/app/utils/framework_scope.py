ACTIVE_FRAMEWORKS = [
    ("ISO_9001", "ISO 9001", "2015"),
    ("ISO_27001", "ISO 27001", "2022"),
    ("ISO_14001", "ISO 14001", "2015"),
    ("ISO_45001", "ISO 45001", "2018"),
    ("ISO_22301", "ISO 22301", "2019"),
    ("SA_8000", "SA 8000", "2014"),
    ("HIPAA_OMNIBUS", "HIPAA Omnibus", "Current"),
    ("CMMI_SVC_L3", "CMMI Services Level 3", "L3"),
    ("DPDPA", "Digital Personal Data Protection Act", "2023/2025"),
]

ACTIVE_FRAMEWORK_CODES = frozenset(code for code, _, _ in ACTIVE_FRAMEWORKS)
REMOVED_FRAMEWORK_CODES = frozenset(
    {"GDPR", "SOC_1", "SOC_2", "SOC", "A11Y", "ADA", "WCAG"}
)
