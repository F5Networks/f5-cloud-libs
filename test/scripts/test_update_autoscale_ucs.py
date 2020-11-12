#!/usr/bin/env python
import subprocess
import sys
import os
import io
import tarfile
from shutil import copyfile
import pytest
import mock
import unittest
from scripts.update_autoscale_ucs import *
import filecmp

FILE_LOCATION = os.path.dirname(os.path.abspath(__file__))
TEMP_BASE_CONFIG = os.path.join(FILE_LOCATION, 'data/temp_bigip_base.conf')
TEST_BASE_CONFIG = os.path.join(FILE_LOCATION, 'data/test_bigip_base.conf')
EXTRACT_FILE_LOCATION = os.path.join(FILE_LOCATION, 'data/')

@pytest.fixture(scope="class")
def copy_test_file():
    copyfile(TEST_BASE_CONFIG, TEMP_BASE_CONFIG)
    copyfile(TEST_BASE_CONFIG, EXTRACT_FILE_LOCATION + "some_file")

@pytest.fixture(scope="class")
def replace_gateway():
    replace(TEMP_BASE_CONFIG, "10.1.10.1", "10.10.10.11")

@pytest.fixture(scope="class")
def replace_self_ip():
    replace(TEMP_BASE_CONFIG, "10.1.1.1", "10.11.11.11")

@pytest.fixture(scope="class")
def replace_hostname():
    original_hostname = get_hostname(TEST_BASE_CONFIG)
    dest_hostname = "ip-10-11-11-11.me-south-1.compute.internal"
    replace(TEMP_BASE_CONFIG, original_hostname, dest_hostname)

@pytest.fixture(scope="class")
def replace_self_ip_str():
    original_ucs_ip = get_ip(TEST_BASE_CONFIG)
    original_ucs_ip_str = original_ucs_ip.replace(".", "-")
    dest_ip = get_ip(TEMP_BASE_CONFIG)
    dest_ip_str = dest_ip.replace(".", "-")
    replace(TEMP_BASE_CONFIG, original_ucs_ip_str, dest_ip_str)

@pytest.mark.usefixtures("copy_test_file", "replace_gateway", "replace_self_ip", "replace_self_ip_str", "replace_hostname")
class TestStringMethods(unittest.TestCase):

    def test_get_hostname(self):
        assert(("ip-10-1-1-111.me-south-1.compute.internal") == get_hostname(TEST_BASE_CONFIG))

    def test_replace_hostname(self):
        assert(("ip-10-11-11-11.me-south-1.compute.internal") == get_hostname(TEMP_BASE_CONFIG))

    def test_get_ip(self):
        assert(("10.1.1.1") == get_ip(TEST_BASE_CONFIG))

    def test_replace_ip(self):
        assert(("10.11.11.11") == get_ip(TEMP_BASE_CONFIG))

    def test_get_gateway(self):
        assert(("10.1.10.1") == get_gateway(TEST_BASE_CONFIG))

    def test_replace_gateway(self):
        assert(("10.10.10.11") == get_gateway(TEMP_BASE_CONFIG))

    def test_file_diff_not_equal(self):
        filecmp._cache.clear ()
        self.assertFalse(filecmp.cmp(TEST_BASE_CONFIG, TEMP_BASE_CONFIG, shallow=False), "My error")

    @unittest.expectedFailure
    def test_data_diff_temp_data_changes(self):
        self.test_data = open(TEST_BASE_CONFIG, "r").read()
        self.temp_data = open(TEMP_BASE_CONFIG, "r").read()
        self.maxDiff = None
        self.assertMultiLineEqual(self.test_data, self.temp_data, msg=None)
    
    def test_remove_files(self):
        assert((None) == removeFiles(EXTRACT_FILE_LOCATION, 'some_file'))

@pytest.fixture
def teardown():
    assert((None) == removeFiles(EXTRACT_FILE_LOCATION, 'temp_bigip_base.conf'))

@pytest.mark.usefixtures('teardown')
def test_cleanup():
    pass